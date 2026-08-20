import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/**
 * ImageCropModal
 * source: File object (new upload) OR string URL (existing stored image)
 * aspect: "square" for avatars/categories, "banner" for horizontal 16:9 ads, "free" to preserve the photo ratio
 * onConfirm: (blob: Blob) => void
 * onError: (message: string) => void
 */
export default function ImageCropModal({ source, aspect = "square", onCancel, onConfirm, onError }) {
  const imgRef = useRef(null);
  const dragState = useRef(null);
  const isUrlSource = typeof source === "string";
  const imgUrl = useMemo(() => (isUrlSource ? source : URL.createObjectURL(source)), [source, isUrlSource]);
  const [naturalSize, setNaturalSize] = useState({ width: 0, height: 0 });
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });

  useEffect(() => {
    return () => {
      if (!isUrlSource) URL.revokeObjectURL(imgUrl);
    };
  }, [imgUrl, isUrlSource]);

  useEffect(() => {
    setNaturalSize({ width: 0, height: 0 });
    setScale(1);
    setOffset({ x: 0, y: 0 });
  }, [source]);

  const frameStyle = useMemo(() => {
    if (aspect === "square" || !naturalSize.width || !naturalSize.height) {
      return { width: 260, height: 260 };
    }

    if (aspect === "banner") {
      const width = 320;
      return { width, height: Math.round(width * 9 / 16) };
    }

    // For product photos, preserve the original ratio so the initial view never crops it.
    const ratio = naturalSize.width / naturalSize.height;
    const maxWidth = 300;
    const maxHeight = 260;
    const width = Math.min(maxWidth, Math.max(1, maxHeight * ratio));
    const height = Math.min(maxHeight, Math.max(1, width / ratio));
    return { width: Math.round(width), height: Math.round(height) };
  }, [aspect, naturalSize]);

  const baseScale = naturalSize.width && naturalSize.height
    ? (aspect === "square" || aspect === "banner"
        ? Math.max(frameStyle.width / naturalSize.width, frameStyle.height / naturalSize.height)
        : Math.min(frameStyle.width / naturalSize.width, frameStyle.height / naturalSize.height))
    : 1;

  const getOffsetBounds = useCallback(
    (nextScale) => {
      const imageWidth = naturalSize.width * baseScale * nextScale;
      const imageHeight = naturalSize.height * baseScale * nextScale;
      return {
        x: Math.max(0, (imageWidth - frameStyle.width) / 2),
        y: Math.max(0, (imageHeight - frameStyle.height) / 2),
      };
    },
    [baseScale, frameStyle, naturalSize]
  );

  const clampOffset = useCallback(
    (nextOffset, nextScale = scale) => {
      const bounds = getOffsetBounds(nextScale);
      return {
        x: Math.min(bounds.x, Math.max(-bounds.x, nextOffset.x)),
        y: Math.min(bounds.y, Math.max(-bounds.y, nextOffset.y)),
      };
    },
    [getOffsetBounds, scale]
  );

  const handlePointerDown = useCallback(
    (e) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      e.currentTarget.setPointerCapture?.(e.pointerId);
      dragState.current = { startX: e.clientX, startY: e.clientY, origin: offset };
    },
    [offset]
  );

  const handlePointerMove = useCallback(
    (e) => {
      if (!dragState.current) return;
      const dx = e.clientX - dragState.current.startX;
      const dy = e.clientY - dragState.current.startY;
      setOffset(clampOffset({ x: dragState.current.origin.x + dx, y: dragState.current.origin.y + dy }));
    },
    [clampOffset]
  );

  const handlePointerUp = useCallback((e) => {
    if (dragState.current) e.currentTarget.releasePointerCapture?.(e.pointerId);
    dragState.current = null;
  }, []);

  function handleZoomChange(e) {
    const nextScale = Number(e.target.value);
    setScale(nextScale);
    setOffset((current) => clampOffset(current, nextScale));
  }

  function confirmCrop() {
    const img = imgRef.current;
    if (!img || !naturalSize.width || !naturalSize.height) {
      onError?.("Foto belum selesai dimuat. Silakan coba lagi.");
      return;
    }

    const outputScale = aspect === "square" ? 600 / frameStyle.width : Math.min(1600 / frameStyle.width, aspect === "banner" ? 900 / frameStyle.height : 1600 / frameStyle.height);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(frameStyle.width * outputScale));
    canvas.height = Math.max(1, Math.round(frameStyle.height * outputScale));
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      onError?.("Foto tidak dapat diproses di browser ini.");
      return;
    }

    const drawScale = baseScale * scale;
    const drawW = naturalSize.width * drawScale;
    const drawH = naturalSize.height * drawScale;
    const safeOffset = clampOffset(offset);
    const centerX = frameStyle.width / 2 + safeOffset.x;
    const centerY = frameStyle.height / 2 + safeOffset.y;

    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(
      img,
      (centerX - drawW / 2) * outputScale,
      (centerY - drawH / 2) * outputScale,
      drawW * outputScale,
      drawH * outputScale
    );

    canvas.toBlob(
      (blob) => {
        if (blob) onConfirm(blob);
        else onError?.("Foto tidak dapat diproses.");
      },
      "image/jpeg",
      0.9
    );
  }

  const renderedWidth = naturalSize.width ? naturalSize.width * baseScale : undefined;
  const renderedHeight = naturalSize.height ? naturalSize.height * baseScale : undefined;

  return (
    <div className="crop-modal-backdrop">
      <div className="crop-modal">
        <p className="crop-modal-title">{isUrlSource ? "Reposisi Gambar" : "Atur Gambar"}</p>
        <p className="crop-modal-hint">{aspect === "banner" ? "Geser foto untuk mengatur posisi banner horizontal 16:9." : "Geser foto untuk mengatur posisi. Foto tidak dipotong sebelum kamu memperbesar."}</p>

        <div
          className="crop-frame"
          style={frameStyle}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        >
          <img
            ref={imgRef}
            src={imgUrl}
            alt=""
            draggable={false}
            crossOrigin="anonymous"
            className="crop-frame-img"
            onLoad={(e) => setNaturalSize({ width: e.currentTarget.naturalWidth, height: e.currentTarget.naturalHeight })}
            style={{
              width: renderedWidth ? `${renderedWidth}px` : "auto",
              height: renderedHeight ? `${renderedHeight}px` : "auto",
              transform: `translate(-50%, -50%) translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
            }}
          />
        </div>

        <input
          type="range"
          min="1"
          max="3"
          step="0.05"
          value={scale}
          onChange={handleZoomChange}
          className="crop-zoom-slider"
          aria-label="Perbesar gambar"
        />

        <div className="crop-modal-actions">
          <button className="btn btn-outline" onClick={onCancel} type="button">
            Batal
          </button>
          <button className="btn btn-primary" onClick={confirmCrop} type="button" disabled={!naturalSize.width}>
            Simpan
          </button>
        </div>
      </div>
    </div>
  );
}

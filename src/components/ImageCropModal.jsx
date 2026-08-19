import { useCallback, useMemo, useRef, useState } from "react";

/**
 * ImageCropModal
 * props:
 *  - source: File object (new upload) OR string URL (existing stored image, for reposition)
 *  - aspect: "square" | "free"
 *  - onCancel: () => void
 *  - onConfirm: (blob: Blob) => void
 */
export default function ImageCropModal({ source, aspect = "square", onCancel, onConfirm }) {
  const imgRef = useRef(null);
  const isUrlSource = typeof source === "string";
  const imgUrl = useMemo(() => (isUrlSource ? source : URL.createObjectURL(source)), [source, isUrlSource]);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const dragState = useRef(null);

  const frameStyle =
    aspect === "square" ? { width: 260, height: 260 } : { width: 300, height: 200 };

  const handlePointerDown = useCallback((e) => {
    const point = e.touches ? e.touches[0] : e;
    dragState.current = { startX: point.clientX, startY: point.clientY, origin: offset };
  }, [offset]);

  const handlePointerMove = useCallback((e) => {
    if (!dragState.current) return;
    const point = e.touches ? e.touches[0] : e;
    const dx = point.clientX - dragState.current.startX;
    const dy = point.clientY - dragState.current.startY;
    setOffset({ x: dragState.current.origin.x + dx, y: dragState.current.origin.y + dy });
  }, []);

  const handlePointerUp = useCallback(() => {
    dragState.current = null;
  }, []);

  function confirmCrop() {
    const img = imgRef.current;
    const frame = frameStyle;
    const canvas = document.createElement("canvas");
    const outputSize = aspect === "square" ? 600 : 800;
    canvas.width = outputSize;
    canvas.height = aspect === "square" ? outputSize : Math.round((outputSize * frame.height) / frame.width);

    const ctx = canvas.getContext("2d");
    const naturalW = img.naturalWidth;
    const naturalH = img.naturalHeight;
    const displayedScale = Math.max(frame.width / naturalW, frame.height / naturalH) * scale;

    const drawW = naturalW * displayedScale;
    const drawH = naturalH * displayedScale;
    const centerX = frame.width / 2 + offset.x;
    const centerY = frame.height / 2 + offset.y;

    const outputScale = canvas.width / frame.width;

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
      },
      "image/jpeg",
      0.9
    );
  }

  return (
    <div className="crop-modal-backdrop">
      <div className="crop-modal">
        <p className="crop-modal-title">{isUrlSource ? "Reposisi Gambar" : "Atur Gambar"}</p>

        <div
          className="crop-frame"
          style={frameStyle}
          onMouseDown={handlePointerDown}
          onMouseMove={handlePointerMove}
          onMouseUp={handlePointerUp}
          onMouseLeave={handlePointerUp}
          onTouchStart={handlePointerDown}
          onTouchMove={handlePointerMove}
          onTouchEnd={handlePointerUp}
        >
          <img
            ref={imgRef}
            src={imgUrl}
            alt=""
            draggable={false}
            crossOrigin="anonymous"
            className="crop-frame-img"
            style={{
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
          onChange={(e) => setScale(Number(e.target.value))}
          className="crop-zoom-slider"
          aria-label="Perbesar gambar"
        />

        <div className="crop-modal-actions">
          <button className="btn btn-outline" onClick={onCancel} type="button">
            Batal
          </button>
          <button className="btn btn-primary" onClick={confirmCrop} type="button">
            Simpan
          </button>
        </div>
      </div>
    </div>
  );
}

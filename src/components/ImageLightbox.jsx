import { useEffect, useRef, useState } from "react";

const MIN_SCALE = 1;
const MAX_SCALE = 5;

function clampScale(value) {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, value));
}

function distanceBetween(first, second) {
  return Math.hypot(first.x - second.x, first.y - second.y);
}

function centerBetween(first, second) {
  return { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 };
}

export default function ImageLightbox({ src, alt = "Gambar", open, onClose }) {
  const [scale, setScale] = useState(MIN_SCALE);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const pointersRef = useRef(new Map());
  const gestureRef = useRef(null);
  const movedRef = useRef(false);
  const stageRef = useRef(null);
  const imageRef = useRef(null);
  const historyEntryRef = useRef(false);

  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return undefined;
    setScale(MIN_SCALE);
    setOffset({ x: 0, y: 0 });
    pointersRef.current.clear();
    gestureRef.current = null;
    movedRef.current = false;

    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event) => {
      if (event.key === "Escape") requestClose();
    };
    const handlePopState = () => {
      if (!historyEntryRef.current) return;
      historyEntryRef.current = false;
      onCloseRef.current();
    };
    if (!historyEntryRef.current) {
      window.history.pushState({ ...(window.history.state || {}), __storichiImageLayer: true }, document.title);
      historyEntryRef.current = true;
    }
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("popstate", handlePopState);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("popstate", handlePopState);
      pointersRef.current.clear();
      gestureRef.current = null;
    };
  }, [open]);

  if (!open || !src) return null;

  function requestClose() {
    if (historyEntryRef.current) {
      historyEntryRef.current = false;
      window.history.back();
    }
    onCloseRef.current();
  }

  function clampOffset(nextOffset, nextScale = scale) {
    const stage = stageRef.current;
    const image = imageRef.current;
    if (!stage || !image || !image.offsetWidth || !image.offsetHeight) return nextOffset;
    const maxX = Math.max(0, (image.offsetWidth * nextScale - stage.clientWidth) / 2);
    const maxY = Math.max(0, (image.offsetHeight * nextScale - stage.clientHeight) / 2);
    return {
      x: Math.min(maxX, Math.max(-maxX, nextOffset.x)),
      y: Math.min(maxY, Math.max(-maxY, nextOffset.y)),
    };
  }

  function handlePointerDown(event) {
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const nextPointers = new Map(pointersRef.current);
    nextPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    pointersRef.current = nextPointers;
    movedRef.current = false;

    const points = [...nextPointers.values()];
    if (points.length >= 2) {
      const first = points[0];
      const second = points[1];
      gestureRef.current = {
        type: "pinch",
        distance: distanceBetween(first, second),
        center: centerBetween(first, second),
        scale,
        offset,
      };
    } else {
      gestureRef.current = {
        type: "pan",
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        offset,
      };
    }
  }

  function handlePointerMove(event) {
    if (!pointersRef.current.has(event.pointerId)) return;
    event.preventDefault();
    const nextPointers = new Map(pointersRef.current);
    nextPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    pointersRef.current = nextPointers;
    const points = [...nextPointers.values()];
    if (!points.length || !gestureRef.current) return;

    const gesture = gestureRef.current;
    if (points.length >= 2 && gesture.type === "pinch") {
      const first = points[0];
      const second = points[1];
      const nextDistance = distanceBetween(first, second);
      const nextCenter = centerBetween(first, second);
      const nextScale = clampScale(gesture.scale * (nextDistance / Math.max(1, gesture.distance)));
      setScale(nextScale);
      setOffset(clampOffset({
        x: gesture.offset.x + nextCenter.x - gesture.center.x,
        y: gesture.offset.y + nextCenter.y - gesture.center.y,
      }, nextScale));
      movedRef.current = true;
      return;
    }

    const activePoint = nextPointers.get(gesture.pointerId || event.pointerId);
    if (points.length === 1 && activePoint && gesture.type === "pan") {
      setOffset(clampOffset({
        x: gesture.offset.x + activePoint.x - gesture.startX,
        y: gesture.offset.y + activePoint.y - gesture.startY,
      }));
      movedRef.current = true;
    }
  }

  function handlePointerUp(event) {
    pointersRef.current.delete(event.pointerId);
    const remaining = [...pointersRef.current.entries()];
    if (remaining.length === 1) {
      const [pointerId, point] = remaining[0];
      gestureRef.current = { type: "pan", pointerId, startX: point.x, startY: point.y, offset };
    } else {
      gestureRef.current = null;
    }
  }

  function handleDoubleClick(event) {
    event.stopPropagation();
    setScale((value) => (value > MIN_SCALE ? MIN_SCALE : 2));
    if (scale > MIN_SCALE) setOffset({ x: 0, y: 0 });
  }

  function handleStageClick(event) {
    if (event.target === event.currentTarget && !movedRef.current) requestClose();
    movedRef.current = false;
  }

  return (
    <div className="image-lightbox" role="dialog" aria-modal="true" aria-label="Pratinjau gambar" onClick={handleStageClick}>
      <div
        ref={stageRef}
        className="image-lightbox-stage"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onClick={handleStageClick}
      >
        <img
          ref={imageRef}
          src={src}
          alt={alt}
          draggable={false}
          onClick={(event) => event.stopPropagation()}
          onDoubleClick={handleDoubleClick}
          style={{ transform: `translate3d(${offset.x}px, ${offset.y}px, 0) scale(${scale})` }}
        />
      </div>
    </div>
  );
}

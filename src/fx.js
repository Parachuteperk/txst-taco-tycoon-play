// Short-lived motion marks. The crew loops strip baked yellow doodles out of
// the bitmap and hand the leftovers here, so a looping frame cannot jitter
// with a spark that was painted into the cell.

export function drawSparks(ctx, sparks, feetX, feetY, scale, alpha) {
  if (!sparks?.length || !(alpha > 0.04) || !(scale > 0)) return;
  ctx.save();
  ctx.globalAlpha = Math.min(1, alpha);
  ctx.strokeStyle = '#FFE14A';
  ctx.lineWidth = Math.max(1, scale * 1.6);
  ctx.lineCap = 'round';
  for (const spark of sparks) {
    const x = feetX + spark.x * scale;
    const y = feetY + spark.y * scale;
    const len = Math.max(2, (spark.len || 6) * scale);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + spark.dx * len, y + spark.dy * len);
    ctx.stroke();
  }
  ctx.restore();
}

// Helper function to download canvas as PNG
export const downloadCanvasPNG = (canvas: HTMLCanvasElement | null, filename: string): void => {
  if (!canvas) return;
  const url = canvas.toDataURL("image/png");
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
};

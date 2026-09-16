// Stub module to satisfy pdfjs-dist node-canvas import in Next.js Turbopack and Webpack builds
const stubCanvas = {};
export default stubCanvas;
export const createCanvas = () => null;

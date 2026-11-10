// QR code for invite links, drawn as SVG (offline, via the vendored MIT library).
import qrcode from '../vendor/qrcode.mjs';

export function qrSvg(text) {
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  return qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true, alt: { text: 'QR code for the invite link' } });
}

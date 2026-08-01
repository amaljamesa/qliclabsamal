// Placeholder for the QRious library. The invoice layout only calls this when an e-invoice
// IRN QR code is configured (jsonData.others.einvoice_details) - not wired up anywhere in
// this app yet, so this renders a plain gray box instead of an actual scannable QR code.
// Replace with the real QRious build (https://github.com/neocotic/qrious) if/when e-invoice
// QR codes are needed.
function QRious(opts) {
    var el = opts && opts.element;
    if (el && el.getContext) {
        el.width = opts.size || 100;
        el.height = opts.size || 100;
        var ctx = el.getContext('2d');
        ctx.fillStyle = '#ccc';
        ctx.fillRect(0, 0, el.width, el.height);
    }
}

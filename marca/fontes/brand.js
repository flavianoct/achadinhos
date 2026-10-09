// Símbolo: etiqueta de preço cortada por um raio.
function symbolSVG(tag, bolt, cut) {
  return `<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
  <g transform="rotate(-18 100 100)">
    <path d="M26 100 L74 50 H164 Q176 50 176 62 V138 Q176 150 164 150 H74 Z" fill="${tag}" stroke="${tag}" stroke-width="10" stroke-linejoin="round"/>
    <circle cx="70" cy="100" r="10" fill="${cut}"/>
  </g>
  <path d="M128 10 L82 106 H112 L90 190 L154 84 H122 L146 10 Z" fill="${bolt}" stroke="${cut}" stroke-width="10" stroke-linejoin="round" paint-order="stroke"/>
</svg>`;
}
document.querySelectorAll('.sym').forEach(el => {
  el.innerHTML = symbolSVG(el.dataset.tag || '#FFFFFF', el.dataset.bolt || '#FFD60A', el.dataset.cut || '#E10600');
});

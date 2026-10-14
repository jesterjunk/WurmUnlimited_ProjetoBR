'use strict';
/* Projeto BR — grade de balanceamento 8x8 sobre o live map (WurmMapGen).
 *
 * Como chega ao navegador: o web.py (servidor http 8081) injeta a tag
 * <script src="app/grid.js"> no index.html SERVIDO — o WurmMapGen regenera
 * index.html a cada hora (cron :17) a partir do template do jar, então
 * editar o index.html não sobrevive; injetar em tempo de servir, sim.
 * Arquivo próprio em www/app/ = o jar não conhece, nunca sobrescreve.
 *
 * A grade é camada de VETORES do Leaflet (L.polyline) => acompanha pan e
 * zoom nativamente: cresce/dimui com zoom-in/zoom-out e não "pisca" como
 * as emendas dos PNG (que só apareciam durante a animação de zoom).
 *
 * Células = 512x512 tiles = chaves A1..H8 do balance_auto.py v5.2
 * (coluna A-H = x oeste->leste, linha 1-8 = y norte->sul).
 *
 * Níveis de zoom (pedido do coord, 2026-10-14):
 *   - zoom-out (abaixo de SUB_MIN_ZOOM): só a ZONA MAIOR — linhas 8x8 e
 *     rótulo A1..H8 no canto inferior direito de cada célula;
 *   - zoom-in (>= SUB_MIN_ZOOM): as células viram 4 sub-quadrantes de
 *     256x256 tiles cada, com rótulo A1.1..A1.4 no canto inferior direito
 *     de cada um (1=noroeste, 2=nordeste, 3=sudoeste, 4=sudeste) + linhas
 *     divisórias bem discretas; o rótulo grande sai p/ não sobrepor
 *     (A1.4 cai exatamente no mesmo canto do A1).
 *
 * Zoom-out confortável: quando o mapa inteiro já cabe na janela,
 * recentraliza no centro do mundo — antes o wheel-zoom deixava a vista
 * fora de centro e o maxBounds (viscosidade 1.0) impedia arrastar.
 * Libera também o nível de zoom 1 (mundo = 512px; pedido do coord
 * 2026-10-14): no nível mínimo antigo (2) o mundo tem 1024px e a janela
 * do navegador é menor => linha 8 do quadrante ficava fora da tela.
 * Mesmos PNGs escalados pelo browser (minNativeZoom=4 carrega z4 e
 * reduz) e a grade, sendo vetor no MESMO CRS, acompanha — não desalinha.
 *
 * Checkbox "Show balance grid (8x8)" no sidebar, estado em cookie
 * (wmg_setting_balanceGrid; padrão desligado).
 */
(function() {

var CELL = 512;                 // tiles por célula (4096 / 8)
var SUB = 256;                  // tiles por sub-quadrante (512 / 2)
var COLS = 8;
var ROWS = 8;
var COL_L = 'ABCDEFGH';
var SUB_MIN_ZOOM = 5;           // zoom >= 5 = sub-quadrantes A1.1..A1.4
var LABEL_PAD = 14;             // recuo do rótulo grande (tiles)
var SUB_PAD = 10;               // recuo do rótulo sub (tiles)
var LINE_STYLE = {color: '#ffffff', weight: 1, opacity: 0.7, interactive: false};
var SUB_LINE_STYLE = {color: '#ffffff', weight: 1, opacity: 0.35,
                      dashArray: '4 6', interactive: false};

function boot() {
	var wm = window.WurmMapGen;
	if (!wm || !wm.map || !wm.map.map || !wm.util || !wm.config) { return false; }

	var map = wm.map.map;
	var xy = wm.util.xy;
	var size = wm.config.actualMapSize;     // 4096
	var i, k, c, r, sx, sy;

	// 4 camadas: linhas 8x8 | linhas sub 256 | rótulos A1..H8 | rótulos A1.x
	var lines = L.layerGroup();
	var subLines = L.layerGroup();
	var labels = L.layerGroup();
	var subLabels = L.layerGroup();

	// linhas verticais e horizontais nas bordas das células
	for (i = 0; i <= COLS; i++) {
		L.polyline([xy(i * CELL, 0), xy(i * CELL, size)], LINE_STYLE).addTo(lines);
	}
	for (i = 0; i <= ROWS; i++) {
		L.polyline([xy(0, i * CELL), xy(size, i * CELL)], LINE_STYLE).addTo(lines);
	}

	// linhas divisórias dos sub-quadrantes (só as INTERIORES de célula,
	// múltiplos ímpares de 256) — discretas, só no zoom alto
	for (k = 1; k < size / SUB; k++) {
		if (k % 2 === 1) {
			L.polyline([xy(k * SUB, 0), xy(k * SUB, size)], SUB_LINE_STYLE)
				.addTo(subLines);
			L.polyline([xy(0, k * SUB), xy(size, k * SUB)], SUB_LINE_STYLE)
				.addTo(subLines);
		}
	}

	// rótulo A1..H8 no canto inferior DIREITO de cada célula:
	// ponto = canto SE recuado LABEL_PAD; iconAnchor no canto inferior
	// direito do rótulo = texto fica DENTRO da célula.
	for (c = 0; c < COLS; c++) {
		for (r = 0; r < ROWS; r++) {
			L.marker(xy((c + 1) * CELL - LABEL_PAD, (r + 1) * CELL - LABEL_PAD), {
				icon: L.divIcon({
					className: 'balgrid-cell',
					html: COL_L[c] + (r + 1),
					iconSize: [40, 13],
					iconAnchor: [40, 13]
				}),
				interactive: false,
				keyboard: false,
				zIndexOffset: -900
			}).addTo(labels);
		}
	}

	// rótulo A1.1..A1.4 no canto inferior DIREITO de cada sub-quadrante
	// (256x256) — numeração 1=NW 2=NE 3=SW 4=SE
	for (c = 0; c < COLS; c++) {
		for (r = 0; r < ROWS; r++) {
			for (sy = 0; sy < 2; sy++) {
				for (sx = 0; sx < 2; sx++) {
					var ex = (c * CELL + (sx + 1) * SUB) - SUB_PAD;
					var ey = (r * CELL + (sy + 1) * SUB) - SUB_PAD;
					L.marker(xy(ex, ey), {
						icon: L.divIcon({
							className: 'balgrid-sub',
							html: COL_L[c] + (r + 1) + '.' + (sy * 2 + sx + 1),
							iconSize: [52, 13],
							iconAnchor: [52, 13]
						}),
						interactive: false,
						keyboard: false,
						zIndexOffset: -900
					}).addTo(subLabels);
				}
			}
		}
	}

	var css = document.createElement('style');
	css.textContent = '.balgrid-cell{color:rgba(255,255,255,.7);' +
		'font:bold 10px Roboto,sans-serif;text-align:center;line-height:13px;' +
		'text-shadow:0 0 3px rgba(0,0,0,.9);}' +
		'.balgrid-sub{color:rgba(255,255,255,.65);' +
		'font:bold 9px Roboto,sans-serif;text-align:center;line-height:13px;' +
		'text-shadow:0 0 3px rgba(0,0,0,.9);}';
	document.head.appendChild(css);

	// Libera zoom-out até o nível 1 (mundo = 512px = cabe qualquer tela):
	// setMinZoom mexe só no mapa; o tile layer precisa do options.minZoom
	// também, senão GridLayer._pruneTiles apaga os tiles abaixo do intervalo
	// dele (options.minZoom=2 do map.js) e a tela fica VAZIA no nível 1.
	map.setMinZoom(1);
	map.eachLayer(function(lyr) {
		if (lyr instanceof L.TileLayer && lyr.options.minZoom > 1) {
			lyr.options.minZoom = 1;
		}
	});
	map.fire('zoomlevelschange');   // atualiza o estado do botão "-"

	// checkbox no sidebar (nó injetado fora do template do Vue; mesmo estilo)
	var block = document.createElement('div');
	block.className = 'block';
	block.innerHTML = '<label class="flex" for="option-show-balance-grid">' +
		'<input type="checkbox" class="transition" id="option-show-balance-grid">' +
		'<span>Show balance grid (8x8)</span></label>';
	var sidebar = document.getElementById('sidebar');
	var attr = sidebar.querySelector('.attribution');
	if (attr) { sidebar.insertBefore(block, attr); } else { sidebar.appendChild(block); }
	var cb = block.querySelector('input');

	function toggle(layer, want) {
		if (want && !map.hasLayer(layer)) { map.addLayer(layer); }
		else if (!want && want === false && map.hasLayer(layer)) { map.removeLayer(layer); }
	}

	function refresh() {
		var on = cb.checked;
		var sub = on && map.getZoom() >= SUB_MIN_ZOOM;
		toggle(lines, on);
		toggle(subLines, sub);
		toggle(labels, on && !sub);      // A1..H8 sai quando A1.x entra
		toggle(subLabels, sub);
	}
	cb.addEventListener('change', function() {
		wm.util.setConfig('balanceGrid', cb.checked);
		refresh();
	});
	map.on('zoomend', refresh);

	// Zoom-out confortável: quando o mapa inteiro já cabe na janela,
	// recentraliza no centro do mundo (2048,2048) mantendo o zoom.
	function centerIfFits() {
		var zoom = map.getZoom();
		var world = Math.abs(map.project(xy(size, size), zoom).y -
		                     map.project(xy(0, 0), zoom).y);
		var vs = map.getSize();
		if (vs.x >= world && vs.y >= world) {
			map.setView(xy(size / 2, size / 2), zoom, {animate: false});
		}
	}
	map.on('zoomend', centerIfFits);

	cb.checked = wm.util.getConfig('balanceGrid', false);
	refresh();
	centerIfFits();
	return true;
}

// o main.js cria o mapa dentro de um .then() (fetch dos dados) — aguarda
(function poll() {
	if (!boot()) { setTimeout(poll, 200); }
})();

})();

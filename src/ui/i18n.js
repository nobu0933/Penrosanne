const STORAGE_KEY = 'penrosanne-language';

const messages = {
	ja: {
		'log.title': 'プレイログ', 'log.tile': 'タイルを設置', 'log.meeple': 'ミープルを{feature}に配置', 'log.completed': '{feature}完成 [+{points}]', 'log.replay': '対局をリプレイしています…', 'log.replayButton': 'もう一度再生',
		'page.gameTitle': 'Penrosanne — 描画プロトタイプ',
		'page.galleryTitle': 'Penrosanne — タイル一覧・デバッグ',
		'nav.home': 'Penrosanne ホーム', 'nav.resetView': '表示をリセット', 'nav.gallery': 'タイル一覧・デバッグ',
		'nav.game': 'ゲームへ戻る', 'status.game': '描画・操作プロトタイプ', 'status.gallery': 'タイル定義・アンカー確認',
		'language.label': '表示言語', 'language.ja': '日本語', 'language.en': 'English',
		'section.gameDeck': 'ゲーム用山札', 'section.currentTile': '現在のタイル', 'section.board': '盤面', 'section.settings': '設定', 'section.deck': '山札', 'section.scores': '得点', 'section.scope': 'ルールメモ', 'section.catalog': 'デバッグ用タイル一覧',
		'player.score': '確定得点', 'player.meeples': '残りミープル', 'player.chips': '頂点チップ {count}',
		'deck.game': 'GAME DECK', 'deck.select': '山札', 'deck.matchingPattern': '辺記号パターン', 'deck.terrainPattern': '地形パターン', 'deck.terrainMirror': '地形の左右反転',
		'deck.both': '通常・180度回転を判定', 'deck.normalOnly': '通常のみを判定', 'deck.once': '各プレイヤー1回', 'deck.unlimited': '何回でも判定・使用', 'deck.start': 'この山札で新しいゲーム',
		'currentTile': 'CURRENT TILE', 'tile.current': '現在のタイル', 'tile.redo': '↩ やり直す', 'tile.redraw': '↺ 引き直し（1回）', 'tile.redrawNoCandidate': '↺ 通常候補なし：引き直し', 'tile.mirrorOnce': '⇋ 地形を反転（1回）',
		'board.title': 'ひし形の谷', 'board.confirmed': '確定配置', 'board.candidate': 'このタイルを配置可能', 'board.canvas': 'ゲーム盤面', 'board.rotate': '180度回転', 'board.rotateTerrain': '地形を180度回転', 'board.mirrorTerrain': '地形を左右反転', 'board.confirm': '配置を確定', 'board.skipMeeple': 'ミープルを置かない', 'board.help': 'ドラッグで移動　／　ホイール・ピンチで拡大縮小　／　候補をクリックして配置', 'board.forceEnd': 'デバッグ：強制終了・採点', 'board.forceEndTitle': 'デバッグ用：ただちに終局得点を計算します',
		'settings.title': 'プロトタイプ設定', 'settings.theme': 'タイルテーマ', 'settings.noTheme': 'テーマなし（デバッグ）', 'settings.meadow': '草原', 'settings.cyber': 'サイバー', 'settings.side': 'タイル辺長', 'settings.sideValue': '画面高の 1/5', 'settings.vertices': '頂点色を表示', 'settings.progressive': '確定配置をぱらぱら表示', 'settings.note': '試作セット。開始タイルはランダム、青赤頂点もランダムに決定されます。', 'settings.scope': '草原は終局時、隣接する完成都市1つにつき3点です。四角の候補は草原（終局まで残留）、丸は完成時に回収できる領域です。',
		'feature.city': '都市', 'feature.road': '道', 'feature.field': '草原', 'feature.monastery': '修道院', 'feature.place': '{feature} に置く',
		'game.over': 'GAME OVER', 'game.finished': '対局終了', 'game.placeMeeple': 'ミープルを置きますか？', 'game.turn': '{player} の手番', 'game.allTilesProcessed': 'すべてのタイルを処理しました', 'game.placeMeeplePrompt': 'ミープルを配置してください', 'game.player': 'プレイヤー {number}', 'game.playerShort': 'PLAYER {number}',
		'score.total': '{player}　合計 {score}点', 'score.none': '得点なし', 'score.end': '終局', 'score.complete': '完成', 'score.event': '{reason}：{feature}',
		'gallery.heading': 'タイル一覧', 'gallery.note': '各アンカーには、配置時と同じ直立／寝そべりミープルを表示します。アンカーへカーソルを合わせると、ゲーム画面と同じ領域だけを着色します。位置調整モードではミープルをドラッグして、現在のテーマ用アンカーを一時調整できます。', 'gallery.deck': '表示するデッキ', 'gallery.adjustAnchors': 'アンカー位置を調整', 'gallery.copyAnchors': '現在テーマの全アンカーをコピー', 'gallery.adjustDeck': 'デッキを調整', 'gallery.copyDeck': '調整後のデッキ定義をコピー', 'gallery.catalog': '全タイル（CATALOG）', 'gallery.tileAria': '{tile} {shape} のタイル', 'gallery.catalogNotice': 'CATALOG は参照用です。ゲーム用デッキを選択してください。', 'gallery.deckStatusEdit': '{deck}：{count}枚（左クリック +1／右クリック -1）', 'gallery.deckStatus': '{deck}：{count}枚', 'gallery.copyAnchorsDone': '✓ 現在のテーマの全アンカーをコピーしました', 'gallery.copyDeckDone': '✓ {deck} のデッキ定義をコピーしました', 'gallery.fieldSubregions': '小領域 {regions}', 'gallery.edge': '辺 {edges}', 'gallery.none': 'なし', 'gallery.manual': '手動：x {x} / y {y}', 'gallery.auto': '自動：x {x} / y {y}',
		'deck.lite': 'Lite', 'deck.standard': 'Standard', 'deck.roadOnly': '道だけ', 'deck.liteDescription': '36枚・短時間向け', 'deck.standardDescription': '90枚・暫定基本セット', 'deck.roadOnlyDescription': '42枚・道／交差点／修道院のみ',
	},
	en: {
		'log.title': 'Play log', 'log.tile': 'Tile placed', 'log.meeple': 'Meeple placed on {feature}', 'log.completed': '{feature} completed [+{points}]', 'log.replay': 'Replaying the game…', 'log.replayButton': 'Play replay again',
		'page.gameTitle': 'Penrosanne — Play Prototype', 'page.galleryTitle': 'Penrosanne — Tile Catalog & Debug',
		'nav.home': 'Penrosanne home', 'nav.resetView': 'Reset view', 'nav.gallery': 'Tile catalog & debug', 'nav.game': 'Back to game', 'status.game': 'Rendering & interaction prototype', 'status.gallery': 'Tile definitions & anchor inspection',
		'language.label': 'Language', 'language.ja': '日本語', 'language.en': 'English',
		'section.gameDeck': 'GAME DECK', 'section.currentTile': 'CURRENT TILE', 'section.board': 'BOARD', 'section.settings': 'SETTINGS', 'section.deck': 'DECK', 'section.scores': 'SCORES', 'section.scope': 'SCOPE', 'section.catalog': 'DEBUG TILE CATALOG',
		'player.score': 'Score', 'player.meeples': 'Meeples left', 'player.chips': 'Vertex chips {count}',
		'deck.game': 'GAME DECK', 'deck.select': 'Deck', 'deck.matchingPattern': 'Edge-symbol pattern', 'deck.terrainPattern': 'Terrain pattern', 'deck.terrainMirror': 'Terrain mirror', 'deck.both': 'Allow normal and 180° rotation', 'deck.normalOnly': 'Normal only', 'deck.once': 'Once per player', 'deck.unlimited': 'Unlimited', 'deck.start': 'Start a new game with this deck',
		'currentTile': 'CURRENT TILE', 'tile.current': 'Current tile', 'tile.redo': '↩ Undo preview', 'tile.redraw': '↺ Redraw (once)', 'tile.redrawNoCandidate': '↺ No normal candidate: redraw', 'tile.mirrorOnce': '⇋ Mirror terrain (once)',
		'board.title': 'Rhombus Valley', 'board.confirmed': 'Forced placement', 'board.candidate': 'Place current tile here', 'board.canvas': 'Game board', 'board.rotate': 'Rotate 180°', 'board.rotateTerrain': 'Rotate terrain 180°', 'board.mirrorTerrain': 'Mirror terrain', 'board.confirm': 'Confirm placement', 'board.skipMeeple': 'Skip meeple', 'board.help': 'Drag to pan / wheel or pinch to zoom / click a candidate to preview', 'board.forceEnd': 'Debug: end game & score', 'board.forceEndTitle': 'Debug: calculate final scores immediately',
		'settings.title': 'Prototype settings', 'settings.theme': 'Tile theme', 'settings.noTheme': 'No theme (debug)', 'settings.meadow': 'Meadow', 'settings.cyber': 'Cyber', 'settings.side': 'Tile side length', 'settings.sideValue': '1/5 of screen height', 'settings.vertices': 'Show vertex colors', 'settings.progressive': 'Animate forced placements', 'settings.note': 'Prototype set. The starting tile and its red/blue vertex state are chosen at random.', 'settings.scope': 'At game end, each completed city adjacent to a field scores 3 points. Square markers are fields (stay until the end); round markers return when completed.',
		'feature.city': 'City', 'feature.road': 'Road', 'feature.field': 'Field', 'feature.monastery': 'Monastery', 'feature.place': 'Place on {feature}',
		'game.over': 'GAME OVER', 'game.finished': 'Game over', 'game.placeMeeple': 'Place a meeple?', 'game.turn': "{player}'s turn", 'game.allTilesProcessed': 'All tiles have been processed', 'game.placeMeeplePrompt': 'Place a meeple', 'game.player': 'Player {number}', 'game.playerShort': 'PLAYER {number}',
		'score.total': '{player} — total {score}', 'score.none': 'No score', 'score.end': 'End game', 'score.complete': 'Completed', 'score.event': '{reason}: {feature}',
		'gallery.heading': 'Tile catalog', 'gallery.note': 'Each anchor shows the same standing or lying meeple used during play. Hover an anchor to tint only its matching area. In anchor-edit mode, drag meeples to temporarily adjust anchors for the current theme.', 'gallery.deck': 'Deck to show', 'gallery.adjustAnchors': 'Adjust anchor positions', 'gallery.copyAnchors': 'Copy all anchors for this theme', 'gallery.adjustDeck': 'Adjust deck', 'gallery.copyDeck': 'Copy adjusted deck definition', 'gallery.catalog': 'All tiles (CATALOG)', 'gallery.tileAria': '{tile} {shape} tile', 'gallery.catalogNotice': 'CATALOG is reference-only. Select a playable deck.', 'gallery.deckStatusEdit': '{deck}: {count} tiles (left-click +1 / right-click -1)', 'gallery.deckStatus': '{deck}: {count} tiles', 'gallery.copyAnchorsDone': '✓ Copied all anchors for this theme', 'gallery.copyDeckDone': '✓ Copied the {deck} deck definition', 'gallery.fieldSubregions': 'Subregions {regions}', 'gallery.edge': 'Edges {edges}', 'gallery.none': 'none', 'gallery.manual': 'Manual: x {x} / y {y}', 'gallery.auto': 'Auto: x {x} / y {y}',
		'deck.lite': 'Lite', 'deck.standard': 'Standard', 'deck.roadOnly': 'Road only', 'deck.liteDescription': '36 tiles · quick game', 'deck.standardDescription': '90 tiles · provisional base set', 'deck.roadOnlyDescription': '42 tiles · roads, junctions, and monasteries only',
	},
};

let currentLanguage = localStorage.getItem(STORAGE_KEY) === 'en' ? 'en' : 'ja';

export function language() { return currentLanguage; }
export function t(key, values = {}) {
	const template = messages[currentLanguage][key] ?? messages.ja[key] ?? key;
	return template.replace(/\{(\w+)\}/g, (_, name) => values[name] ?? `{${name}}`);
}
export function applyTranslations(root = document) {
	document.documentElement.lang = currentLanguage;
	root.querySelectorAll('[data-i18n]').forEach((element) => { element.textContent = t(element.dataset.i18n); });
	root.querySelectorAll('[data-i18n-aria-label]').forEach((element) => element.setAttribute('aria-label', t(element.dataset.i18nAriaLabel)));
	root.querySelectorAll('[data-i18n-title]').forEach((element) => element.setAttribute('title', t(element.dataset.i18nTitle)));
}
export function setLanguage(nextLanguage) {
	currentLanguage = nextLanguage === 'en' ? 'en' : 'ja';
	localStorage.setItem(STORAGE_KEY, currentLanguage);
	applyTranslations();
	window.dispatchEvent(new CustomEvent('penrosanne-language-change', { detail: { language: currentLanguage } }));
}
export function bindLanguageSelect(select) {
	select.value = currentLanguage;
	select.addEventListener('change', (event) => setLanguage(event.target.value));
}
export function deckText(deck) {
	const key = { lite: 'lite', standard: 'standard', 'road-only': 'roadOnly' }[deck.id] || deck.id;
	return { label: t(`deck.${key}`), description: t(`deck.${key}Description`) };
}

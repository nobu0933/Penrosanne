const STORAGE_KEY = 'penrosanne-language';

const messages = {
	ja: {
		'log.open': 'プレイログを表示', 'log.close': 'プレイログを閉じる',
		'setup.handMode': '手札モード', 'setup.singleHand': '通常（1枚）', 'setup.privatePlanning': '私的な都市計画（公開手札3枚）',
		'hand.choose': '置くタイルを選択', 'hand.number': '手札{number}', 'hand.tile': '{player}の手札{number}', 'hand.redrawNeeded': '手札を1枚引き直してください', 'log.pass': 'パス',
		'ui.undo': 'やり直す', 'ui.redraw': '引き直す', 'ui.close': '閉じる', 'ui.newGame': 'New game', 'ui.start': 'ゲーム開始', 'ui.development': '開発用', 'ui.cancel': 'キャンセル', 'ui.continue': '続行',
		'log.title': 'プレイログ', 'score.details': '得点詳細', 'log.tile': 'を設置', 'log.meeple': 'を{feature}に配置', 'log.completed': '{feature}完成', 'log.points': '[+{points}]', 'log.redraw': '引き直した', 'log.replay': '対局をリプレイしています…', 'log.replayButton': 'もう一度再生',
		'page.gameTitle': 'Penrosanne — 描画プロトタイプ',
		'page.galleryTitle': 'Penrosanne — タイル一覧・デバッグ',
		'nav.home': 'Penrosanne ホーム', 'nav.resetView': '表示をリセット', 'nav.gallery': 'タイル一覧・デバッグ',
		'nav.game': 'ゲームへ戻る', 'status.game': '描画・操作プロトタイプ', 'status.gallery': 'タイル定義・アンカー確認',
		'language.label': '表示言語', 'language.ja': '日本語', 'language.en': 'English',
		'setup.playerCount': 'プレイヤー人数', 'setup.players2': '2人', 'setup.players3': '3人', 'setup.players4': '4人', 'setup.player1Color': 'プレイヤー1のミープル色', 'setup.player2Color': 'プレイヤー2のミープル色', 'setup.player3Color': 'プレイヤー3のミープル色', 'setup.player4Color': 'プレイヤー4のミープル色', 'setup.colorNumber': '{number} 色目', 'setup.duplicateColorsTitle': 'ミープル色が重複しています', 'setup.duplicateColorsMessage': '他のプレイヤーと同じ色が選択されています。このままゲームを開始または再開しますか？',
		'section.gameDeck': 'ゲーム用山札', 'section.currentTile': '現在のタイル', 'section.board': '盤面', 'section.settings': '設定', 'section.deck': '山札', 'section.scores': '得点', 'section.scope': 'ルールメモ', 'section.catalog': 'デバッグ用タイル一覧',
		'player.score': '確定得点', 'player.meeples': '残りミープル', 'player.vertexCompletions': '頂点完成数 {count}', 'player.supportCount': '支援回数 {count}', 'score.completeShort': '完成', 'score.endShort': '終局', 'score.titleShort': '称号',
		'settings.off': 'オフ', 'settings.on': 'オン', 'title.vertexKing': '頂点王', 'title.roadKing': '延伸王', 'title.supportKing': '支援王', 'title.vertexKingDescription': '頂点完成数が最も多いプレイヤーに贈られます。', 'title.roadKingDescription': '所有した道のうち、最も長い道を持つプレイヤーに贈られます。未完成の道も対象です。', 'title.supportKingDescription': '他プレイヤーが得点した都市・道・修道院を完成させた支援回数が最も多いプレイヤーに贈られます。', 'title.endBonus': '対戦終了時に10点獲得。同率首位なら全員が獲得します。', 'title.provisional': '{player}が暫定首位：+10', 'score.titleEvent': '称号：{title}',
		'deck.game': 'GAME DECK', 'deck.select': '山札', 'deck.matchingPattern': '辺記号パターン', 'deck.terrainPattern': '地形パターン', 'deck.terrainMirror': '地形の左右反転',
		'deck.both': '通常・180度回転を判定', 'deck.normalOnly': '通常のみを判定', 'deck.unlimited': '何度でも判定・使用', 'deck.mirrorDisabled': '使用不能', 'deck.start': 'この山札で新しいゲーム',
		'currentTile': 'CURRENT TILE', 'tile.current': '現在のタイル', 'tile.redo': '↩ やり直す', 'tile.redraw': '↺ 引き直し（1回）', 'tile.redrawNoCandidate': '↺ 通常候補なし：引き直し',
		'board.title': 'ひし形の谷', 'board.confirmed': '確定配置', 'board.candidate': 'このタイルを配置可能', 'board.canvas': 'ゲーム盤面', 'board.rotate': '180度回転', 'board.rotateTerrain': '地形を180度回転', 'board.mirrorTerrain': '地形を左右反転', 'board.confirm': '配置を確定', 'board.skipMeeple': 'ミープルを置かない', 'board.help': 'ドラッグで移動　／　ホイール・ピンチで拡大縮小　／　候補をクリックして配置', 'board.forceEnd': 'デバッグ：強制終了・採点', 'board.forceEndTitle': 'デバッグ用：ただちに終局得点を計算します',
		'settings.title': 'プロトタイプ設定', 'settings.theme': 'タイルテーマ', 'settings.noTheme': 'テーマなし（デバッグ）', 'settings.meadow': '草原', 'settings.cyber': 'サイバー', 'settings.side': 'タイル辺長', 'settings.sideValue': '画面高の 1/5', 'settings.vertices': '頂点色を表示', 'settings.progressive': '確定配置をぱらぱら表示', 'settings.fieldRule': '草原ルール', 'settings.enabled': '適用する', 'settings.disabled': '適用しない（草原に配置不可・得点なし）', 'settings.matchingRule': 'マッチングルール', 'settings.standardRules': '辺記号・頂点型・絶対禁則を適用', 'settings.ignoreMatchingRules': '無視（地形接続と重なりのみ）', 'settings.note': '試作セット。開始タイルはランダム、青赤頂点もランダムに決定されます。', 'settings.scope': '草原は終局時、隣接する完成都市1つにつき3点です。四角の候補は草原（終局まで残留）、丸は完成時に回収できる領域です。',
		'game.expanding': '盤面を拡張中…', 'game.expandingProgress': '盤面を拡張中…（{count}枚追加）', 'game.expansionFailed': '盤面の拡張に失敗しました',
		'feature.city': '都市', 'feature.road': '道', 'feature.field': '草原', 'feature.monastery': '修道院', 'feature.place': '{feature} に置く',
		'game.over': 'GAME OVER', 'game.finished': '対戦終了', 'game.placeMeeple': 'ミープルを置きますか？', 'game.turn': '{player} の手番', 'game.allTilesProcessed': 'すべてのタイルを処理しました', 'game.placeMeeplePrompt': 'ミープルを配置してください', 'game.player': 'プレイヤー {number}', 'game.playerShort': 'PLAYER {number}',
		'score.total': '{player}　合計 {score}点', 'score.none': '得点なし', 'score.end': '終局', 'score.complete': '完成', 'score.event': '{reason}：{feature}',
		'gallery.heading': 'タイル一覧', 'gallery.note': '各アンカーには、配置時と同じ直立／寝そべりミープルを表示します。アンカーへカーソルを合わせると、ゲーム画面と同じ領域だけを着色します。位置調整モードではミープルをドラッグして、現在のテーマ用アンカーを一時調整できます。', 'gallery.deck': '表示するデッキ', 'gallery.adjustAnchors': 'アンカー位置を調整', 'gallery.copyAnchors': '現在テーマの全アンカーをコピー', 'gallery.adjustDeck': 'デッキを調整', 'gallery.copyDeck': '調整後のデッキ定義をコピー', 'gallery.catalog': '全タイル（CATALOG）', 'gallery.tileAria': '{tile} {shape} のタイル', 'gallery.catalogNotice': 'CATALOG は参照用です。ゲーム用デッキを選択してください。', 'gallery.deckStatusEdit': '{deck}：{count}枚（左クリック +1／右クリック -1）', 'gallery.deckStatus': '{deck}：{count}枚', 'gallery.copyAnchorsDone': '✓ 現在のテーマの全アンカーをコピーしました', 'gallery.copyDeckDone': '✓ {deck} のデッキ定義をコピーしました', 'gallery.fieldSubregions': '小領域 {regions}', 'gallery.edge': '辺 {edges}', 'gallery.none': 'なし', 'gallery.manual': '手動：x {x} / y {y}', 'gallery.auto': '自動：x {x} / y {y}',
		'deck.lite': 'Lite', 'deck.standard': 'Standard', 'deck.roadOnly': '道だけ', 'deck.liteDescription': '36枚・短時間向け', 'deck.standardDescription': '90枚・暫定基本セット', 'deck.roadOnlyDescription': '42枚・道／交差点／修道院のみ',
	},
	en: {
		'log.open': 'Show play log', 'log.close': 'Close play log',
		'setup.handMode': 'Hand mode', 'setup.singleHand': 'Standard (1 tile)', 'setup.privatePlanning': 'Private City Planning (3 public tiles)',
		'hand.choose': 'Choose a tile', 'hand.number': 'Tile {number}', 'hand.tile': '{player}, tile {number}', 'hand.redrawNeeded': 'Redraw one tile from your hand', 'log.pass': 'passed',
		'ui.undo': 'Undo', 'ui.redraw': 'Redraw', 'ui.close': 'Close', 'ui.newGame': 'New game', 'ui.start': 'Start game', 'ui.development': 'Development', 'ui.cancel': 'Cancel', 'ui.continue': 'Continue',
		'log.title': 'Play log', 'score.details': 'Score details', 'log.tile': ' placed', 'log.meeple': ' on {feature}', 'log.completed': '{feature} completed', 'log.points': '[+{points}]', 'log.redraw': 'redrew a tile', 'log.replay': 'Replaying the game…', 'log.replayButton': 'Play replay again',
		'page.gameTitle': 'Penrosanne — Play Prototype', 'page.galleryTitle': 'Penrosanne — Tile Catalog & Debug',
		'nav.home': 'Penrosanne home', 'nav.resetView': 'Reset view', 'nav.gallery': 'Tile catalog & debug', 'nav.game': 'Back to game', 'status.game': 'Rendering & interaction prototype', 'status.gallery': 'Tile definitions & anchor inspection',
		'language.label': 'Language', 'language.ja': '日本語', 'language.en': 'English',
		'setup.playerCount': 'Players', 'setup.players2': '2 players', 'setup.players3': '3 players', 'setup.players4': '4 players', 'setup.player1Color': 'Player 1 meeple color', 'setup.player2Color': 'Player 2 meeple color', 'setup.player3Color': 'Player 3 meeple color', 'setup.player4Color': 'Player 4 meeple color', 'setup.colorNumber': 'Color {number}', 'setup.duplicateColorsTitle': 'Meeple colors overlap', 'setup.duplicateColorsMessage': 'Two or more players have selected the same color. Start or resume the game anyway?',
		'section.gameDeck': 'GAME DECK', 'section.currentTile': 'CURRENT TILE', 'section.board': 'BOARD', 'section.settings': 'SETTINGS', 'section.deck': 'DECK', 'section.scores': 'SCORES', 'section.scope': 'SCOPE', 'section.catalog': 'DEBUG TILE CATALOG',
		'player.score': 'Score', 'player.meeples': 'Meeples left', 'player.vertexCompletions': 'Completed vertices {count}', 'player.supportCount': 'Supports {count}', 'score.completeShort': 'Done', 'score.endShort': 'End', 'score.titleShort': 'Titles',
		'settings.off': 'Off', 'settings.on': 'On', 'title.vertexKing': 'Vertex King', 'title.roadKing': 'Road King', 'title.supportKing': 'Support King', 'title.vertexKingDescription': 'Awarded to the player with the most completed vertices.', 'title.roadKingDescription': 'Awarded to the player who owned the longest road, including unfinished roads.', 'title.supportKingDescription': 'Awarded to the player who most often completed a city, road, or monastery scored by another player.', 'title.endBonus': 'Earn 10 points at game end. All tied leaders earn the bonus.', 'title.provisional': '{player} provisionally leads: +10', 'score.titleEvent': 'Title: {title}',
		'deck.game': 'GAME DECK', 'deck.select': 'Deck', 'deck.matchingPattern': 'Edge-symbol pattern', 'deck.terrainPattern': 'Terrain pattern', 'deck.terrainMirror': 'Terrain mirror', 'deck.both': 'Allow normal and 180° rotation', 'deck.normalOnly': 'Normal only', 'deck.unlimited': 'Check and use unlimited times', 'deck.mirrorDisabled': 'Unavailable', 'deck.start': 'Start a new game with this deck',
		'currentTile': 'CURRENT TILE', 'tile.current': 'Current tile', 'tile.redo': '↩ Undo preview', 'tile.redraw': '↺ Redraw (once)', 'tile.redrawNoCandidate': '↺ No normal candidate: redraw',
		'board.title': 'Rhombus Valley', 'board.confirmed': 'Forced placement', 'board.candidate': 'Place current tile here', 'board.canvas': 'Game board', 'board.rotate': 'Rotate 180°', 'board.rotateTerrain': 'Rotate terrain 180°', 'board.mirrorTerrain': 'Mirror terrain', 'board.confirm': 'Confirm placement', 'board.skipMeeple': 'Skip meeple', 'board.help': 'Drag to pan / wheel or pinch to zoom / click a candidate to preview', 'board.forceEnd': 'Debug: end game & score', 'board.forceEndTitle': 'Debug: calculate final scores immediately',
		'settings.title': 'Prototype settings', 'settings.theme': 'Tile theme', 'settings.noTheme': 'No theme (debug)', 'settings.meadow': 'Meadow', 'settings.cyber': 'Cyber', 'settings.side': 'Tile side length', 'settings.sideValue': '1/5 of screen height', 'settings.vertices': 'Show vertex colors', 'settings.progressive': 'Animate forced placements', 'settings.fieldRule': 'Field rules', 'settings.enabled': 'Enabled', 'settings.disabled': 'Disabled (no field meeples or points)', 'settings.matchingRule': 'Matching rules', 'settings.standardRules': 'Apply edge symbols, vertex types, and absolute placement rule', 'settings.ignoreMatchingRules': 'Ignore (terrain match and no overlap only)', 'settings.note': 'Prototype set. The starting tile and its red/blue vertex state are chosen at random.', 'settings.scope': 'At game end, each completed city adjacent to a field scores 3 points. Square markers are fields (stay until the end); round markers return when completed.',
		'game.expanding': 'Expanding board…', 'game.expandingProgress': 'Expanding board… ({count} added)', 'game.expansionFailed': 'Board expansion failed',
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

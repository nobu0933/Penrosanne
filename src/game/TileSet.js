import { createTile, edgeNames } from './Tile.js';

const fields = (groups) =>
	groups.map((group, index) =>
		Array.isArray(group)
			? { id: `field-${index}`, boundaryEdges: group }
			: { id: `field-${index}`, ...group },
	);

// 草原得点用の小領域。番号は頂点の周囲を反時計回りに ①〜④ とする。
// `featureGroups.field` はミープル配置時の既存判定用であり、この定義は終局得点とホバー専用。
const SCORE_FIELD_GROUPS = {
	'straight-road': [
		[1, 4],
		[2, 3],
	],
	'straight-road-reverse': [
		[1, 2],
		[3, 4],
	],
	'curve-road-c': [[1, 3, 4], [2]],
	'curve-road-v': [[3], [4, 1, 2]],
	'city-one-side': [[1, 2, 3, 4]],
	'city-one-side-reverse': [[1, 2, 3, 4]],
	'city-one-side-straight-road': [
		[1, 2],
		[3, 4],
	],
	'city-one-side-straight-road-reverse': [
		[1, 4],
		[2, 3],
	],
	'city-one-side-curve-road-c': [[1, 3, 4], [2]],
	'city-one-side-curve-road-v': [[1, 2, 4], [3]],
	'city-one-side-curve-road-c-reverse': [[3, 1, 2], [4]],
	'city-one-side-curve-road-v-reverse': [[1, 2, 4], [3]],
	'city-road-end-c': [[1, 3, 4], [2]],
	'city-road-end-c-reverse': [[3, 1, 2], [4]],
	'city-road-end-v': [[1], [2, 3, 4]],
	'city-road-end-v-reverse': [[1], [2, 3, 4]],
	'city-one-two-road-ends': [[1, 4], [2], [3]],
	'city-one-two-road-ends-reverse': [[1, 2], [3], [4]],
	'city-road-end-third': [
		[1, 4],
		[2, 3],
	],
	'city-road-end-third-reverse': [
		[1, 2],
		[3, 4],
	],
	'city-opposite-separated-curve-road': [[1, 2, 4], [3]],
	'city-opposite-separated-road-second-to-first': [[1, 3, 4], [2]],
	'city-opposite-separated-road-second-to-first-reverse': [[1, 2, 3], [4]],
	'city-opposite-separated-road-third-to-first': [
		[1, 4],
		[2, 3],
	],
	'city-opposite-separated-road-third-to-first-reverse': [
		[1, 2],
		[3, 4],
	],
	'city-opposite-separated-two-road-ends': [[1, 3], [2], [4]],
	'city-opposite-connected-road-second-end': [[1, 3, 4], [2]],
	'city-opposite-connected-road-second-end-reverse': [[1, 2, 3], [4]],
	'city-opposite-connected-two-road-ends': [[1, 3], [2], [4]],
	'monastery-two-road-ends': [[1, 2, 4], [3]],
	't-junction': [[3], [4], [1, 2]],
	't-junction-reverse': [[1, 4], [2], [3]],
	'city-three-connected': [[3, 4, 1, 2]],
	'city-three-connected-reverse': [[3, 4, 1, 2]],
	'city-three-road': [[3], [4, 1, 2]],
	'city-three-road-reverse': [[3, 1, 2], [4]],
	'city-opposite-connected': [
		[2, 3],
		[1, 4],
	],
	'city-opposite-connected-reverse': [
		[1, 2],
		[3, 4],
	],
	'city-opposite-separated': [[1, 2, 3, 4]],
	'city-opposite-separated-reverse': [[1, 2, 3, 4]],
	'city-adjacent-connected-c': [[1, 2, 3, 4]],
	'city-adjacent-connected-v': [[1, 2, 3, 4]],
	'city-adjacent-curve-road-c': [[1, 2, 3], [4]],
	'city-adjacent-curve-road-v': [[1, 2, 4], [3]],
	'city-adjacent-separated-c': [[1, 2, 3, 4]],
	'city-adjacent-separated-v': [[1, 2, 3, 4]],
	'city-one-t-junction': [[3], [4], [1, 2]],
	'city-one-t-junction-reverse': [[1, 4], [2], [3]],
	'cross-junction': [[1], [2], [3], [4]],
	'monastery-field': [[1, 2, 3, 4]],
	'monastery-road-end': [[1, 2, 3, 4]],
	'monastery-road-end-reverse': [[3, 4, 1, 2]],
};

// アンカーの唯一の編集場所。キーは `${shape}:${idPrefix}`、配列順は featureGroups の添字と一致する。
// 数値は「タイル辺長を 1 とした、重心からの相対座標」。ここを直接変更して位置を調整する。
const A = (city = [], road = [], field = [], monastery = []) => ({
	city: city.map(([x, y]) => ({ x, y })),
	road: road.map(([x, y]) => ({ x, y })),
	field: field.map(([x, y]) => ({ x, y })),
	monastery: monastery.map(([x, y]) => ({ x, y })),
});
const DEFAULT_MANUAL_FEATURE_ANCHORS = new Map([
	[
		'thin:straight-road',
		A(
			[],
			[[-0.001, -0.017]],
			[
				[-0.28, -0.1],
				[0.28, 0.1],
			],
			[],
		),
	],
	[
		'fat:straight-road',
		A(
			[],
			[[0.0, 0.0]],
			[
				[-0.2, -0.25],
				[0.2, 0.25],
			],
			[],
		),
	],
	[
		'thin:straight-road-reverse',
		A(
			[],
			[[0.001, -0.024]],
			[
				[0.28, -0.1],
				[-0.28, 0.1],
			],
			[],
		),
	],
	[
		'fat:straight-road-reverse',
		A(
			[],
			[[0.0, 0.0]],
			[
				[0.2, -0.25],
				[-0.2, 0.25],
			],
			[],
		),
	],
	[
		'thin:curve-road-c',
		A(
			[],
			[[0.323, -0.034]],
			[
				[-0.295, -0.034],
				[0.684, -0.034],
			],
			[],
		),
	],
	[
		'fat:curve-road-c',
		A(
			[],
			[[0.0, 0.0]],
			[
				[-0.35, 0.0],
				[0.4, 0.0],
			],
			[],
		),
	],
	[
		'thin:curve-road-v',
		A(
			[],
			[[0.006, -0.072]],
			[
				[0.041, 0.122],
				[0.631, -0.038],
			],
			[],
		),
	],
	[
		'fat:curve-road-v',
		A(
			[],
			[[-0.01, -0.024]],
			[
				[0.004, 0.428],
				[-0.003, -0.413],
			],
			[],
		),
	],
	['thin:city-one-side', A([[0.383, -0.086]], [], [[-0.165, 0.025]], [])],
	['fat:city-one-side', A([[0.207, -0.291]], [], [[-0.1, 0.1]], [])],
	['thin:city-one-side-reverse', A([[-0.316, -0.097]], [], [[0.198, 0.014]], [])],
	['fat:city-one-side-reverse', A([[-0.165, -0.298]], [], [[0.105, 0.118]], [])],
	[
		'thin:city-one-side-straight-road',
		A(
			[[0.4, -0.15]],
			[[0.152, 0.022]],
			[
				[-0.14, -0.228],
				[-0.182, 0.133],
			],
			[],
		),
	],
	[
		'fat:city-one-side-straight-road',
		A(
			[[0.26, -0.311]],
			[[0.0, 0.0]],
			[
				[0.3, 0.1],
				[-0.2, 0.22],
			],
			[],
		),
	],
	[
		'thin:city-one-side-straight-road-reverse',
		A(
			[[-0.381, -0.144]],
			[[-0.145, 0.008]],
			[
				[0.175, -0.207],
				[0.119, 0.14],
			],
			[],
		),
	],
	[
		'fat:city-one-side-straight-road-reverse',
		A(
			[[-0.25, -0.3]],
			[[0.0, 0.0]],
			[
				[-0.3, 0.1],
				[0.221, 0.181],
			],
			[],
		),
	],
	[
		'thin:city-one-side-curve-road-c',
		A(
			[[-0.337, -0.097]],
			[[0.4, 0.0]],
			[
				[0.0, 0.05],
				[0.684, -0.021],
			],
			[],
		),
	],
	[
		'fat:city-one-side-curve-road-c',
		A(
			[[-0.172, -0.285]],
			[[0.2, -0.15]],
			[
				[-0.15, 0.2],
				[0.432, -0.021],
			],
			[],
		),
	],
	[
		'thin:city-one-side-curve-road-v',
		A(
			[[0.3, -0.15]],
			[[0.1, 0.1]],
			[
				[-0.23, -0.161],
				[-0.293, 0.159],
			],
			[],
		),
	],
	[
		'fat:city-one-side-curve-road-v',
		A(
			[[0.198, -0.293]],
			[[0.0, 0.17]],
			[
				[-0.253, -0.14],
				[0.0, 0.5],
			],
			[],
		),
	],
	[
		'thin:city-one-side-curve-road-c-reverse',
		A(
			[[0.348, -0.091]],
			[[-0.4, 0.0]],
			[
				[-0.068, 0.04],
				[-0.679, -0.029],
			],
			[],
		),
	],
	[
		'fat:city-one-side-curve-road-c-reverse',
		A(
			[[0.221, -0.266]],
			[[-0.223, -0.176]],
			[
				[0.082, 0.206],
				[-0.411, -0.016],
			],
			[],
		),
	],
	[
		'thin:city-one-side-curve-road-v-reverse',
		A(
			[[-0.3, -0.15]],
			[[-0.1, 0.1]],
			[
				[0.24, -0.176],
				[0.3, 0.15],
			],
			[],
		),
	],
	[
		'fat:city-one-side-curve-road-v-reverse',
		A(
			[[-0.185, -0.255]],
			[[0.0, 0.17]],
			[
				[0.237, -0.121],
				[0.0, 0.5],
			],
			[],
		),
	],
	[
		'thin:city-road-end-c',
		A(
			[[0.3, -0.15]],
			[[0.214, 0.093]],
			[
				[-0.3, 0.0],
				[0.6, 0.05],
			],
			[],
		),
	],
	[
		'fat:city-road-end-c',
		A(
			[[0.198, -0.33]],
			[[0.0, 0.2]],
			[
				[-0.3, -0.1],
				[0.3, 0.15],
			],
			[],
		),
	],
	[
		'thin:city-road-end-c-reverse',
		A(
			[[-0.3, -0.15]],
			[[-0.152, 0.08]],
			[
				[0.3, 0.0],
				[-0.6, 0.05],
			],
			[],
		),
	],
	[
		'fat:city-road-end-c-reverse',
		A(
			[[-0.2, -0.3]],
			[[0.0, 0.2]],
			[
				[0.3, -0.1],
				[-0.3, 0.15],
			],
			[],
		),
	],
	[
		'thin:city-road-end-v',
		A(
			[[0.3, -0.15]],
			[[0.004, 0.03]],
			[
				[-0.142, -0.206],
				[0.3, 0.1],
			],
			[],
		),
	],
	[
		'fat:city-road-end-v',
		A(
			[[0.2, -0.25]],
			[[-0.1, 0.0]],
			[
				[-0.131, -0.477],
				[0.0, 0.4],
			],
			[],
		),
	],
	[
		'thin:city-road-end-v-reverse',
		A(
			[[-0.3, -0.15]],
			[[0.034, 0.021]],
			[
				[0.214, -0.194],
				[-0.3, 0.1],
			],
			[],
		),
	],
	[
		'fat:city-road-end-v-reverse',
		A(
			[[-0.212, -0.291]],
			[[0.108, 0.042]],
			[
				[0.15, -0.5],
				[0.0, 0.4],
			],
			[],
		),
	],
	[
		'thin:t-junction',
		A(
			[],
			[
				[-0.325, 0.084],
				[-0.193, -0.083],
				[0.279, 0.035],
			],
			[
				[0.0, 0.2],
				[-0.6, 0.0],
				[0.4, -0.15],
			],
			[],
		),
	],
	[
		'fat:t-junction',
		A(
			[],
			[
				[-0.147, 0.233],
				[-0.119, -0.267],
				[0.2, 0.282],
			],
			[
				[0.0, 0.45],
				[-0.35, 0.0],
				[0.3, -0.2],
			],
			[],
		),
	],
	[
		'thin:t-junction-reverse',
		A(
			[],
			[
				[0.288, 0.094],
				[0.274, -0.093],
				[-0.281, 0.032],
			],
			[
				[-0.608, -0.024],
				[0.6, 0.0],
				[0.0, 0.2],
			],
			[],
		),
	],
	[
		'fat:t-junction-reverse',
		A(
			[],
			[
				[0.189, 0.24],
				[0.133, -0.267],
				[-0.131, 0.24],
			],
			[
				[-0.256, -0.218],
				[0.355, -0.038],
				[0.0, 0.45],
			],
			[],
		),
	],
	['thin:city-four-connected', A([[0.0, 0.0]], [], [], [])],
	['fat:city-four-connected', A([[0.0, 0.0]], [], [], [])],
	['thin:city-three-connected', A([[-0.179, -0.042]], [], [[0.217, 0.118]], [])],
	['fat:city-three-connected', A([[-0.133, -0.124]], [], [[0.228, 0.216]], [])],
	['thin:city-three-connected-reverse', A([[0.212, -0.013]], [], [[-0.205, 0.133]], [])],
	['fat:city-three-connected-reverse', A([[0.14, -0.138]], [], [[-0.2, 0.237]], [])],
	[
		'thin:city-three-road',
		A(
			[[-0.2, -0.05]],
			[[0.3, 0.05]],
			[
				[0.131, 0.169],
				[0.617, 0.037],
			],
			[],
		),
	],
	[
		'fat:city-three-road',
		A(
			[[-0.1, -0.1]],
			[[0.163, 0.211]],
			[
				[0.15, 0.45],
				[0.365, 0.148],
			],
			[],
		),
	],
	[
		'thin:city-three-road-reverse',
		A(
			[[0.2, -0.05]],
			[[-0.3, 0.05]],
			[
				[-0.131, 0.148],
				[-0.6, 0.05],
			],
			[],
		),
	],
	[
		'fat:city-three-road-reverse',
		A(
			[[0.1, -0.1]],
			[[-0.133, 0.188]],
			[
				[-0.133, 0.473],
				[-0.376, 0.168],
			],
			[],
		),
	],
	[
		'thin:city-opposite-connected',
		A(
			[[0.0, 0.0]],
			[],
			[
				[0.274, 0.133],
				[-0.274, -0.18],
			],
			[],
		),
	],
	[
		'fat:city-opposite-connected',
		A(
			[[0.0, 0.0]],
			[],
			[
				[0.25, 0.25],
				[-0.25, -0.3],
			],
			[],
		),
	],
	[
		'thin:city-opposite-connected-reverse',
		A(
			[[0.0, 0.0]],
			[],
			[
				[0.284, -0.181],
				[-0.265, 0.125],
			],
			[],
		),
	],
	[
		'fat:city-opposite-connected-reverse',
		A(
			[[0.0, 0.0]],
			[],
			[
				[0.25, -0.3],
				[-0.25, 0.25],
			],
			[],
		),
	],
	[
		'thin:city-opposite-separated',
		A(
			[
				[0.376, -0.104],
				[-0.353, 0.09],
			],
			[],
			[[0.0, 0.0]],
			[],
		),
	],
	[
		'fat:city-opposite-separated',
		A(
			[
				[0.185, -0.255],
				[-0.185, 0.255],
			],
			[],
			[[0.0, 0.0]],
			[],
		),
	],
	[
		'thin:city-opposite-separated-reverse',
		A(
			[
				[0.344, 0.114],
				[-0.35, -0.1],
			],
			[],
			[[-0.01, 0.003]],
			[],
		),
	],
	[
		'fat:city-opposite-separated-reverse',
		A(
			[
				[0.217, 0.302],
				[-0.185, -0.255],
			],
			[],
			[[0.0, 0.0]],
			[],
		),
	],
	['thin:city-adjacent-connected-c', A([[0.4, 0.0]], [], [[-0.411, -0.035]], [])],
	['fat:city-adjacent-connected-c', A([[0.35, 0.0]], [], [[-0.191, -0.028]], [])],
	['thin:city-adjacent-connected-v', A([[-0.138, -0.16]], [], [[0.001, 0.138]], [])],
	['fat:city-adjacent-connected-v', A([[0.0, -0.4]], [], [[0.0, 0.3]], [])],
	[
		'thin:city-adjacent-curve-road-c',
		A(
			[[0.4, 0.0]],
			[[-0.385, -0.02]],
			[
				[-0.108, 0.056],
				[-0.65, 0.0],
			],
			[],
		),
	],
	[
		'fat:city-adjacent-curve-road-c',
		A(
			[[0.35, 0.0]],
			[[-0.214, -0.152]],
			[
				[0.008, 0.021],
				[-0.408, 0.098],
			],
			[],
		),
	],
	[
		'thin:city-adjacent-curve-road-v',
		A(
			[[-0.133, -0.195]],
			[[-0.182, 0.096]],
			[
				[0.145, -0.029],
				[0.117, 0.221],
			],
			[],
		),
	],
	[
		'fat:city-adjacent-curve-road-v',
		A(
			[[-0.003, -0.348]],
			[[-0.003, 0.166]],
			[
				[0.316, 0.069],
				[0.017, 0.465],
			],
			[],
		),
	],
	[
		'thin:city-adjacent-separated-c',
		A(
			[
				[0.348, -0.133],
				[0.223, 0.131],
			],
			[],
			[[-0.36, -0.015]],
			[],
		),
	],
	[
		'fat:city-adjacent-separated-c',
		A(
			[
				[0.172, -0.328],
				[0.172, 0.331],
			],
			[],
			[[-0.258, -0.023]],
			[],
		),
	],
	[
		'thin:city-adjacent-separated-v',
		A(
			[
				[0.358, -0.106],
				[-0.3, -0.097],
			],
			[],
			[[-0.024, 0.067]],
			[],
		),
	],
	[
		'fat:city-adjacent-separated-v',
		A(
			[
				[0.307, -0.203],
				[-0.235, -0.28],
			],
			[],
			[[0.001, 0.262]],
			[],
		),
	],
	[
		'thin:city-one-t-junction',
		A(
			[[0.457, -0.138]],
			[
				[0.339, 0.057],
				[-0.39, 0.099],
				[-0.314, -0.103],
			],
			[
				[0.096, 0.168],
				[-0.64, -0.033],
				[-0.112, -0.214],
			],
			[],
		),
	],
	[
		'fat:city-one-t-junction',
		A(
			[[0.26, -0.311]],
			[
				[0.191, 0.265],
				[-0.226, 0.321],
				[-0.08, -0.228],
			],
			[
				[-0.017, 0.467],
				[-0.351, -0.026],
				[-0.121, -0.513],
			],
			[],
		),
	],
	[
		'thin:city-one-t-junction-reverse',
		A(
			[[-0.36, -0.172]],
			[
				[0.376, 0.092],
				[-0.29, 0.057],
				[0.369, -0.124],
			],
			[
				[0.154, -0.2],
				[0.605, -0.033],
				[-0.117, 0.168],
			],
			[],
		),
	],
	[
		'fat:city-one-t-junction-reverse',
		A(
			[[-0.237, -0.306]],
			[
				[0.193, 0.222],
				[-0.14, 0.25],
				[0.124, -0.292],
			],
			[
				[-0.341, 0.097],
				[0.36, -0.035],
				[0.006, 0.465],
			],
			[],
		),
	],
	[
		'thin:cross-junction',
		A(
			[],
			[
				[0.205, -0.111],
				[0.358, 0.076],
				[-0.212, 0.076],
				[-0.371, -0.132],
			],
			[
				[-0.101, -0.215],
				[0.635, -0.035],
				[0.101, 0.187],
				[-0.615, -0.021],
			],
			[],
		),
	],
	[
		'fat:cross-junction',
		A(
			[],
			[
				[0.154, -0.292],
				[0.21, 0.229],
				[-0.152, 0.25],
				[-0.179, -0.208],
			],
			[
				[-0.006, -0.514],
				[0.355, -0.049],
				[0.015, 0.451],
				[-0.353, -0.042],
			],
			[],
		),
	],
	['thin:monastery-field', A([], [], [[0.416, -0.02]], [[-0.015, 0.015]])],
	['fat:monastery-field', A([], [], [[0.01, 0.397]], [[0.017, 0.042]])],
	['thin:monastery-road-end', A([], [[0.404, 0.001]], [[-0.561, 0.008]], [[0.0, 0.0]])],
	['fat:monastery-road-end', A([], [[0.159, 0.303]], [[-0.314, -0.107]], [[0.0, 0.0]])],
	[
		'thin:monastery-road-end-reverse',
		A([], [[-0.371, -0.024]], [[0.622, -0.031]], [[0.059, -0.017]]),
	],
	['fat:monastery-road-end-reverse', A([], [[-0.124, 0.275]], [[0.307, -0.156]], [[0.0, 0.0]])],
	[
		'thin:city-one-two-road-ends',
		A(
			[[0.388, -0.138]],
			[
				[0.27, 0.098],
				[-0.196, 0.056],
			],
			[
				[-0.48, -0.076],
				[0.575, 0.035],
				[0.02, 0.167],
			],
			[],
		),
	],
	[
		'fat:city-one-two-road-ends',
		A(
			[[0.212, -0.305]],
			[
				[0.17, 0.174],
				[-0.149, 0.16],
			],
			[
				[-0.26, -0.173],
				[0.358, 0.16],
				[-0.003, 0.445],
			],
			[],
		),
	],
	[
		'thin:city-one-two-road-ends-reverse',
		A(
			[[-0.311, -0.145]],
			[
				[-0.249, 0.091],
				[0.217, 0.07],
			],
			[
				[0.404, -0.083],
				[-0.568, 0.028],
				[-0.013, 0.153],
			],
			[],
		),
	],
	[
		'fat:city-one-two-road-ends-reverse',
		A(
			[[-0.196, -0.295]],
			[
				[-0.154, 0.198],
				[0.166, 0.136],
			],
			[
				[0.277, -0.142],
				[-0.369, 0.129],
				[-0.008, 0.462],
			],
			[],
		),
	],
	[
		'thin:city-road-end-third',
		A(
			[[0.399, -0.093]],
			[[-0.08, 0.066]],
			[
				[-0.358, -0.1],
				[0.101, 0.191],
			],
			[],
		),
	],
	[
		'fat:city-road-end-third',
		A(
			[[0.251, -0.267]],
			[[-0.075, 0.045]],
			[
				[-0.2, -0.316],
				[0.147, 0.309],
			],
			[],
		),
	],
	[
		'thin:city-road-end-third-reverse',
		A(
			[[-0.355, -0.076]],
			[[0.089, 0.07]],
			[
				[0.36, -0.132],
				[-0.203, 0.167],
			],
			[],
		),
	],
	[
		'fat:city-road-end-third-reverse',
		A(
			[[-0.226, -0.264]],
			[[0.094, 0.07]],
			[
				[0.18, -0.28],
				[-0.115, 0.34],
			],
			[],
		),
	],
	[
		'thin:city-opposite-separated-curve-road',
		A(
			[
				[0.432, -0.076],
				[-0.339, -0.083],
			],
			[[-0.061, 0.104]],
			[
				[0.064, -0.062],
				[0.126, 0.201],
			],
			[],
		),
	],
	[
		'fat:city-opposite-separated-curve-road',
		A(
			[
				[0.284, -0.249],
				[-0.251, -0.256],
			],
			[[-0.133, 0.209]],
			[
				[-0.008, -0.11],
				[0.006, 0.501],
			],
			[],
		),
	],
	[
		'thin:city-opposite-separated-road-second-to-first',
		A(
			[
				[0.399, -0.136],
				[-0.323, -0.108],
			],
			[[0.226, 0.112]],
			[
				[-0.177, 0.119],
				[0.594, 0.05],
			],
			[],
		),
	],
	[
		'fat:city-opposite-separated-road-second-to-first',
		A(
			[
				[0.265, -0.277],
				[-0.242, -0.256],
			],
			[[0.123, 0.17]],
			[
				[-0.172, 0.314],
				[0.348, 0.147],
			],
			[],
		),
	],
	[
		'thin:city-opposite-separated-road-second-to-first-reverse',
		A(
			[
				[0.381, -0.081],
				[-0.293, -0.144],
			],
			[[-0.084, 0.037]],
			[
				[0.214, 0.113],
				[-0.501, 0.037],
			],
			[],
		),
	],
	[
		'fat:city-opposite-separated-road-second-to-first-reverse',
		A(
			[
				[0.295, -0.234],
				[-0.226, -0.262],
			],
			[[-0.08, 0.113]],
			[
				[0.129, 0.217],
				[-0.302, 0.155],
			],
			[],
		),
	],
	[
		'thin:city-opposite-separated-road-third-to-first',
		A(
			[
				[0.369, -0.081],
				[-0.297, -0.144],
			],
			[[-0.096, 0.065]],
			[
				[-0.561, 0.044],
				[0.161, 0.176],
			],
			[],
		),
	],
	[
		'fat:city-opposite-separated-road-third-to-first',
		A(
			[
				[0.277, -0.247],
				[-0.244, -0.254],
			],
			[[-0.015, 0.177]],
			[
				[-0.293, 0.163],
				[0.2, 0.274],
			],
			[],
		),
	],
	[
		'thin:city-opposite-separated-road-third-to-first-reverse',
		A(
			[
				[0.406, -0.122],
				[-0.434, -0.059],
			],
			[[0.066, 0.059]],
			[
				[0.587, 0.045],
				[-0.156, 0.177],
			],
			[],
		),
	],
	[
		'fat:city-opposite-separated-road-third-to-first-reverse',
		A(
			[
				[0.258, -0.254],
				[-0.263, -0.212],
			],
			[[-0.02, 0.086]],
			[
				[0.286, 0.149],
				[-0.165, 0.357],
			],
			[],
		),
	],
	[
		'thin:city-opposite-separated-two-road-ends',
		A(
			[
				[0.402, -0.1],
				[-0.383, -0.128],
			],
			[
				[0.242, 0.08],
				[-0.251, 0.073],
			],
			[
				[-0.008, 0.108],
				[0.596, 0.039],
				[-0.571, 0.053],
			],
			[],
		),
	],
	[
		'fat:city-opposite-separated-two-road-ends',
		A(
			[
				[0.254, -0.267],
				[-0.219, -0.253],
			],
			[
				[0.17, 0.289],
				[-0.121, 0.157],
			],
			[
				[-0.003, 0.497],
				[0.372, 0.178],
				[-0.371, 0.192],
			],
			[],
		),
	],
	[
		'thin:city-opposite-connected-road-second-end',
		A(
			[[-0.179, -0.156]],
			[[0.196, 0.094]],
			[
				[-0.263, 0.08],
				[0.592, 0.025],
			],
			[],
		),
	],
	[
		'fat:city-opposite-connected-road-second-end',
		A(
			[[0.0, -0.42]],
			[[0.047, 0.121]],
			[
				[-0.175, 0.273],
				[0.36, 0.065],
			],
			[],
		),
	],
	[
		'thin:city-opposite-connected-road-second-end-reverse',
		A(
			[[0.17, -0.164]],
			[[-0.108, 0.086]],
			[
				[0.254, 0.093],
				[-0.601, 0.044],
			],
			[],
		),
	],
	[
		'fat:city-opposite-connected-road-second-end-reverse',
		A(
			[[0.015, -0.372]],
			[[-0.068, 0.141]],
			[
				[0.175, 0.287],
				[-0.332, 0.107],
			],
			[],
		),
	],
	[
		'thin:city-opposite-connected-two-road-ends',
		A(
			[[0.089, -0.165]],
			[
				[0.36, 0.092],
				[-0.314, 0.064],
			],
			[
				[-0.001, 0.126],
				[0.603, 0.036],
				[-0.605, 0.043],
			],
			[],
		),
	],
	[
		'fat:city-opposite-connected-two-road-ends',
		A(
			[[0.017, -0.381]],
			[
				[0.198, 0.244],
				[-0.135, 0.092],
			],
			[
				[0.01, 0.425],
				[0.372, 0.071],
				[-0.371, 0.078],
			],
			[],
		),
	],
	[
		'thin:monastery-two-road-ends',
		A(
			[],
			[
				[0.335, 0.071],
				[-0.402, 0.099],
			],
			[
				[0.612, -0.054],
				[-0.075, 0.217],
			],
			[[0.008, -0.02]],
		),
	],
	[
		'fat:monastery-two-road-ends',
		A(
			[],
			[
				[0.235, 0.31],
				[-0.223, 0.282],
			],
			[
				[-0.265, -0.211],
				[-0.008, 0.456],
			],
			[[0.006, -0.002]],
		),
	],
]);

// テーマごとのアンカー上書き。各テーマのMapには変更が必要なタイルだけを
// 入れ、見つからない場合は `default` の座標を使う。タイル一覧の調整画面から
// 出力した `['themeId', new Map([...])]` を該当エントリーと差し替えて編集する。
export const MANUAL_FEATURE_ANCHORS = new Map([
	['default', DEFAULT_MANUAL_FEATURE_ANCHORS],
	['none', new Map()],
	// MANUAL_FEATURE_ANCHORS の 'meadow' エントリーへ貼り付け
	// MANUAL_FEATURE_ANCHORS の 'meadow' エントリーへ貼り付け
	[
		'meadow',
		new Map([
			[
				'thin:straight-road',
				A(
					[],
					[[-0.001, -0.017]],
					[
						[-0.28, -0.1],
						[0.28, 0.1],
					],
					[],
				),
			],
			[
				'fat:straight-road',
				A(
					[],
					[[0.0, 0.0]],
					[
						[-0.2, -0.25],
						[0.2, 0.25],
					],
					[],
				),
			],
			[
				'thin:straight-road-reverse',
				A(
					[],
					[[0.001, -0.024]],
					[
						[0.28, -0.1],
						[-0.28, 0.1],
					],
					[],
				),
			],
			[
				'fat:straight-road-reverse',
				A(
					[],
					[[0.0, 0.0]],
					[
						[0.2, -0.25],
						[-0.2, 0.25],
					],
					[],
				),
			],
			[
				'thin:curve-road-c',
				A(
					[],
					[[0.323, -0.034]],
					[
						[-0.295, -0.034],
						[0.684, -0.034],
					],
					[],
				),
			],
			[
				'fat:curve-road-c',
				A(
					[],
					[[0.0, 0.0]],
					[
						[-0.35, 0.0],
						[0.4, 0.0],
					],
					[],
				),
			],
			[
				'thin:curve-road-v',
				A(
					[],
					[[0.006, -0.072]],
					[
						[0.041, 0.122],
						[0.631, -0.038],
					],
					[],
				),
			],
			[
				'fat:curve-road-v',
				A(
					[],
					[[-0.01, -0.024]],
					[
						[0.004, 0.428],
						[-0.003, -0.413],
					],
					[],
				),
			],
			['thin:city-one-side', A([[0.383, -0.086]], [], [[-0.165, 0.025]], [])],
			['fat:city-one-side', A([[0.207, -0.291]], [], [[-0.1, 0.1]], [])],
			['thin:city-one-side-reverse', A([[-0.316, -0.097]], [], [[0.198, 0.014]], [])],
			['fat:city-one-side-reverse', A([[-0.165, -0.298]], [], [[0.105, 0.118]], [])],
			[
				'thin:city-one-side-straight-road',
				A(
					[[0.4, -0.15]],
					[[0.152, 0.022]],
					[
						[-0.14, -0.228],
						[-0.182, 0.133],
					],
					[],
				),
			],
			[
				'fat:city-one-side-straight-road',
				A(
					[[0.26, -0.311]],
					[[0.0, 0.0]],
					[
						[0.3, 0.1],
						[-0.2, 0.22],
					],
					[],
				),
			],
			[
				'thin:city-one-side-straight-road-reverse',
				A(
					[[-0.381, -0.144]],
					[[-0.145, 0.008]],
					[
						[0.175, -0.207],
						[0.119, 0.14],
					],
					[],
				),
			],
			[
				'fat:city-one-side-straight-road-reverse',
				A(
					[[-0.25, -0.3]],
					[[0.0, 0.0]],
					[
						[-0.3, 0.1],
						[0.221, 0.181],
					],
					[],
				),
			],
			[
				'thin:city-one-side-curve-road-c',
				A(
					[[-0.337, -0.097]],
					[[0.4, 0.0]],
					[
						[0.0, 0.05],
						[0.684, -0.021],
					],
					[],
				),
			],
			[
				'fat:city-one-side-curve-road-c',
				A(
					[[-0.172, -0.285]],
					[[0.2, -0.15]],
					[
						[-0.15, 0.2],
						[0.432, -0.021],
					],
					[],
				),
			],
			[
				'thin:city-one-side-curve-road-v',
				A(
					[[0.3, -0.15]],
					[[0.1, 0.1]],
					[
						[-0.23, -0.161],
						[-0.293, 0.159],
					],
					[],
				),
			],
			[
				'fat:city-one-side-curve-road-v',
				A(
					[[0.198, -0.293]],
					[[0.0, 0.17]],
					[
						[-0.253, -0.14],
						[0.0, 0.5],
					],
					[],
				),
			],
			[
				'thin:city-one-side-curve-road-c-reverse',
				A(
					[[0.348, -0.091]],
					[[-0.4, 0.0]],
					[
						[-0.068, 0.04],
						[-0.679, -0.029],
					],
					[],
				),
			],
			[
				'fat:city-one-side-curve-road-c-reverse',
				A(
					[[0.221, -0.266]],
					[[-0.223, -0.176]],
					[
						[0.082, 0.206],
						[-0.411, -0.016],
					],
					[],
				),
			],
			[
				'thin:city-one-side-curve-road-v-reverse',
				A(
					[[-0.3, -0.15]],
					[[-0.1, 0.1]],
					[
						[0.24, -0.176],
						[0.3, 0.15],
					],
					[],
				),
			],
			[
				'fat:city-one-side-curve-road-v-reverse',
				A(
					[[-0.185, -0.255]],
					[[0.0, 0.17]],
					[
						[0.237, -0.121],
						[0.0, 0.5],
					],
					[],
				),
			],
			[
				'thin:city-road-end-c',
				A(
					[[0.3, -0.15]],
					[[0.214, 0.093]],
					[
						[-0.3, 0.0],
						[0.6, 0.05],
					],
					[],
				),
			],
			[
				'fat:city-road-end-c',
				A(
					[[0.198, -0.33]],
					[[0.0, 0.2]],
					[
						[-0.3, -0.1],
						[0.3, 0.15],
					],
					[],
				),
			],
			[
				'thin:city-road-end-c-reverse',
				A(
					[[-0.3, -0.15]],
					[[-0.152, 0.08]],
					[
						[0.3, 0.0],
						[-0.6, 0.05],
					],
					[],
				),
			],
			[
				'fat:city-road-end-c-reverse',
				A(
					[[-0.2, -0.3]],
					[[0.0, 0.2]],
					[
						[0.3, -0.1],
						[-0.3, 0.15],
					],
					[],
				),
			],
			[
				'thin:city-road-end-v',
				A(
					[[0.3, -0.15]],
					[[0.004, 0.03]],
					[
						[-0.142, -0.206],
						[0.3, 0.1],
					],
					[],
				),
			],
			[
				'fat:city-road-end-v',
				A(
					[[0.2, -0.25]],
					[[-0.1, 0.0]],
					[
						[-0.131, -0.477],
						[0.0, 0.4],
					],
					[],
				),
			],
			[
				'thin:city-road-end-v-reverse',
				A(
					[[-0.3, -0.15]],
					[[0.034, 0.021]],
					[
						[0.214, -0.194],
						[-0.3, 0.1],
					],
					[],
				),
			],
			[
				'fat:city-road-end-v-reverse',
				A(
					[[-0.212, -0.291]],
					[[0.108, 0.042]],
					[
						[0.15, -0.5],
						[0.0, 0.4],
					],
					[],
				),
			],
			[
				'thin:t-junction',
				A(
					[],
					[
						[-0.325, 0.084],
						[-0.193, -0.083],
						[0.279, 0.035],
					],
					[
						[0.0, 0.2],
						[-0.6, 0.0],
						[0.4, -0.15],
					],
					[],
				),
			],
			[
				'fat:t-junction',
				A(
					[],
					[
						[-0.147, 0.233],
						[-0.119, -0.267],
						[0.2, 0.282],
					],
					[
						[0.0, 0.45],
						[-0.35, 0.0],
						[0.3, -0.2],
					],
					[],
				),
			],
			[
				'thin:t-junction-reverse',
				A(
					[],
					[
						[0.288, 0.094],
						[0.274, -0.093],
						[-0.281, 0.032],
					],
					[
						[-0.608, -0.024],
						[0.6, 0.0],
						[0.0, 0.2],
					],
					[],
				),
			],
			[
				'fat:t-junction-reverse',
				A(
					[],
					[
						[0.189, 0.24],
						[0.133, -0.267],
						[-0.131, 0.24],
					],
					[
						[-0.256, -0.218],
						[0.355, -0.038],
						[0.0, 0.45],
					],
					[],
				),
			],
			['thin:city-four-connected', A([[0.0, 0.0]], [], [], [])],
			['fat:city-four-connected', A([[0.0, 0.0]], [], [], [])],
			['thin:city-three-connected', A([[-0.179, -0.042]], [], [[0.217, 0.118]], [])],
			['fat:city-three-connected', A([[-0.133, -0.124]], [], [[0.228, 0.216]], [])],
			['thin:city-three-connected-reverse', A([[0.212, -0.013]], [], [[-0.205, 0.133]], [])],
			['fat:city-three-connected-reverse', A([[0.14, -0.138]], [], [[-0.2, 0.237]], [])],
			[
				'thin:city-three-road',
				A(
					[[-0.2, -0.05]],
					[[0.3, 0.05]],
					[
						[0.131, 0.169],
						[0.617, 0.037],
					],
					[],
				),
			],
			[
				'fat:city-three-road',
				A(
					[[-0.1, -0.1]],
					[[0.163, 0.211]],
					[
						[0.15, 0.45],
						[0.365, 0.148],
					],
					[],
				),
			],
			[
				'thin:city-three-road-reverse',
				A(
					[[0.2, -0.05]],
					[[-0.3, 0.05]],
					[
						[-0.131, 0.148],
						[-0.6, 0.05],
					],
					[],
				),
			],
			[
				'fat:city-three-road-reverse',
				A(
					[[0.1, -0.1]],
					[[-0.133, 0.188]],
					[
						[-0.133, 0.473],
						[-0.376, 0.168],
					],
					[],
				),
			],
			[
				'thin:city-opposite-connected',
				A(
					[[0.0, 0.0]],
					[],
					[
						[0.274, 0.133],
						[-0.274, -0.18],
					],
					[],
				),
			],
			[
				'fat:city-opposite-connected',
				A(
					[[0.0, 0.0]],
					[],
					[
						[0.25, 0.25],
						[-0.25, -0.3],
					],
					[],
				),
			],
			[
				'thin:city-opposite-connected-reverse',
				A(
					[[0.0, 0.0]],
					[],
					[
						[0.284, -0.181],
						[-0.265, 0.125],
					],
					[],
				),
			],
			[
				'fat:city-opposite-connected-reverse',
				A(
					[[0.0, 0.0]],
					[],
					[
						[0.25, -0.3],
						[-0.25, 0.25],
					],
					[],
				),
			],
			[
				'thin:city-opposite-separated',
				A(
					[
						[0.376, -0.104],
						[-0.353, 0.09],
					],
					[],
					[[0.0, 0.0]],
					[],
				),
			],
			[
				'fat:city-opposite-separated',
				A(
					[
						[0.185, -0.255],
						[-0.185, 0.255],
					],
					[],
					[[0.0, 0.0]],
					[],
				),
			],
			[
				'thin:city-opposite-separated-reverse',
				A(
					[
						[0.344, 0.114],
						[-0.35, -0.1],
					],
					[],
					[[-0.01, 0.003]],
					[],
				),
			],
			[
				'fat:city-opposite-separated-reverse',
				A(
					[
						[0.217, 0.302],
						[-0.185, -0.255],
					],
					[],
					[[0.0, 0.0]],
					[],
				),
			],
			['thin:city-adjacent-connected-c', A([[0.4, 0.0]], [], [[-0.411, -0.035]], [])],
			['fat:city-adjacent-connected-c', A([[0.35, 0.0]], [], [[-0.191, -0.028]], [])],
			['thin:city-adjacent-connected-v', A([[-0.138, -0.16]], [], [[0.001, 0.138]], [])],
			['fat:city-adjacent-connected-v', A([[0.0, -0.4]], [], [[0.0, 0.3]], [])],
			[
				'thin:city-adjacent-curve-road-c',
				A(
					[[0.4, 0.0]],
					[[-0.385, -0.02]],
					[
						[-0.108, 0.056],
						[-0.65, 0.0],
					],
					[],
				),
			],
			[
				'fat:city-adjacent-curve-road-c',
				A(
					[[0.35, 0.0]],
					[[-0.214, -0.152]],
					[
						[0.008, 0.021],
						[-0.408, 0.098],
					],
					[],
				),
			],
			[
				'thin:city-adjacent-curve-road-v',
				A(
					[[-0.133, -0.195]],
					[[-0.182, 0.096]],
					[
						[0.145, -0.029],
						[0.117, 0.221],
					],
					[],
				),
			],
			[
				'fat:city-adjacent-curve-road-v',
				A(
					[[-0.003, -0.348]],
					[[-0.003, 0.166]],
					[
						[0.316, 0.069],
						[0.017, 0.465],
					],
					[],
				),
			],
			[
				'thin:city-adjacent-separated-c',
				A(
					[
						[0.348, -0.133],
						[0.223, 0.131],
					],
					[],
					[[-0.36, -0.015]],
					[],
				),
			],
			[
				'fat:city-adjacent-separated-c',
				A(
					[
						[0.172, -0.328],
						[0.172, 0.331],
					],
					[],
					[[-0.258, -0.023]],
					[],
				),
			],
			[
				'thin:city-adjacent-separated-v',
				A(
					[
						[0.358, -0.106],
						[-0.3, -0.097],
					],
					[],
					[[-0.024, 0.067]],
					[],
				),
			],
			[
				'fat:city-adjacent-separated-v',
				A(
					[
						[0.307, -0.203],
						[-0.235, -0.28],
					],
					[],
					[[0.001, 0.262]],
					[],
				),
			],
			[
				'thin:city-one-t-junction',
				A(
					[[0.457, -0.138]],
					[
						[0.339, 0.057],
						[-0.39, 0.099],
						[-0.314, -0.103],
					],
					[
						[0.096, 0.168],
						[-0.64, -0.033],
						[-0.112, -0.214],
					],
					[],
				),
			],
			[
				'fat:city-one-t-junction',
				A(
					[[0.26, -0.311]],
					[
						[0.191, 0.265],
						[-0.226, 0.321],
						[-0.08, -0.228],
					],
					[
						[-0.017, 0.467],
						[-0.351, -0.026],
						[-0.121, -0.513],
					],
					[],
				),
			],
			[
				'thin:city-one-t-junction-reverse',
				A(
					[[-0.36, -0.172]],
					[
						[0.376, 0.092],
						[-0.29, 0.057],
						[0.369, -0.124],
					],
					[
						[0.154, -0.2],
						[0.605, -0.033],
						[-0.117, 0.168],
					],
					[],
				),
			],
			[
				'fat:city-one-t-junction-reverse',
				A(
					[[-0.237, -0.306]],
					[
						[0.193, 0.222],
						[-0.14, 0.25],
						[0.124, -0.292],
					],
					[
						[-0.341, 0.097],
						[0.36, -0.035],
						[0.006, 0.465],
					],
					[],
				),
			],
			[
				'thin:cross-junction',
				A(
					[],
					[
						[0.205, -0.111],
						[0.358, 0.076],
						[-0.212, 0.076],
						[-0.371, -0.132],
					],
					[
						[-0.101, -0.215],
						[0.635, -0.035],
						[0.101, 0.187],
						[-0.615, -0.021],
					],
					[],
				),
			],
			[
				'fat:cross-junction',
				A(
					[],
					[
						[0.154, -0.292],
						[0.21, 0.229],
						[-0.152, 0.25],
						[-0.179, -0.208],
					],
					[
						[-0.006, -0.514],
						[0.355, -0.049],
						[0.015, 0.451],
						[-0.353, -0.042],
					],
					[],
				),
			],
			['thin:monastery-field', A([], [], [[0.416, -0.02]], [[-0.015, 0.015]])],
			['fat:monastery-field', A([], [], [[0.01, 0.397]], [[0.017, 0.042]])],
			['thin:monastery-road-end', A([], [[0.404, 0.001]], [[-0.561, 0.008]], [[0.0, 0.0]])],
			['fat:monastery-road-end', A([], [[0.159, 0.303]], [[-0.314, -0.107]], [[0.0, 0.0]])],
			[
				'thin:monastery-road-end-reverse',
				A([], [[-0.371, -0.024]], [[0.622, -0.031]], [[0.059, -0.017]]),
			],
			['fat:monastery-road-end-reverse', A([], [[-0.124, 0.275]], [[0.307, -0.156]], [[0.0, 0.0]])],
			[
				'thin:city-one-two-road-ends',
				A(
					[[0.388, -0.138]],
					[
						[0.27, 0.098],
						[-0.196, 0.056],
					],
					[
						[-0.48, -0.076],
						[0.575, 0.035],
						[0.02, 0.167],
					],
					[],
				),
			],
			[
				'fat:city-one-two-road-ends',
				A(
					[[0.212, -0.305]],
					[
						[0.17, 0.174],
						[-0.149, 0.16],
					],
					[
						[-0.26, -0.173],
						[0.358, 0.16],
						[-0.003, 0.445],
					],
					[],
				),
			],
			[
				'thin:city-one-two-road-ends-reverse',
				A(
					[[-0.311, -0.145]],
					[
						[-0.249, 0.091],
						[0.217, 0.07],
					],
					[
						[0.404, -0.083],
						[-0.568, 0.028],
						[-0.013, 0.153],
					],
					[],
				),
			],
			[
				'fat:city-one-two-road-ends-reverse',
				A(
					[[-0.196, -0.295]],
					[
						[-0.154, 0.198],
						[0.166, 0.136],
					],
					[
						[0.277, -0.142],
						[-0.369, 0.129],
						[-0.008, 0.462],
					],
					[],
				),
			],
			[
				'thin:city-road-end-third',
				A(
					[[0.399, -0.093]],
					[[-0.08, 0.066]],
					[
						[-0.358, -0.1],
						[0.101, 0.191],
					],
					[],
				),
			],
			[
				'fat:city-road-end-third',
				A(
					[[0.251, -0.267]],
					[[-0.075, 0.045]],
					[
						[-0.2, -0.316],
						[0.147, 0.309],
					],
					[],
				),
			],
			[
				'thin:city-road-end-third-reverse',
				A(
					[[-0.355, -0.076]],
					[[0.089, 0.07]],
					[
						[0.36, -0.132],
						[-0.203, 0.167],
					],
					[],
				),
			],
			[
				'fat:city-road-end-third-reverse',
				A(
					[[-0.226, -0.264]],
					[[0.094, 0.07]],
					[
						[0.18, -0.28],
						[-0.115, 0.34],
					],
					[],
				),
			],
			[
				'thin:city-opposite-separated-curve-road',
				A(
					[
						[0.432, -0.076],
						[-0.339, -0.083],
					],
					[[-0.061, 0.104]],
					[
						[0.064, -0.062],
						[0.126, 0.201],
					],
					[],
				),
			],
			[
				'fat:city-opposite-separated-curve-road',
				A(
					[
						[0.284, -0.249],
						[-0.251, -0.256],
					],
					[[-0.133, 0.209]],
					[
						[-0.008, -0.11],
						[0.006, 0.501],
					],
					[],
				),
			],
			[
				'thin:city-opposite-separated-road-second-to-first',
				A(
					[
						[0.399, -0.136],
						[-0.323, -0.108],
					],
					[[0.226, 0.112]],
					[
						[-0.177, 0.119],
						[0.594, 0.05],
					],
					[],
				),
			],
			[
				'fat:city-opposite-separated-road-second-to-first',
				A(
					[
						[0.265, -0.277],
						[-0.242, -0.256],
					],
					[[0.123, 0.17]],
					[
						[-0.172, 0.314],
						[0.348, 0.147],
					],
					[],
				),
			],
			[
				'thin:city-opposite-separated-road-second-to-first-reverse',
				A(
					[
						[0.381, -0.081],
						[-0.293, -0.144],
					],
					[[-0.084, 0.037]],
					[
						[0.214, 0.113],
						[-0.501, 0.037],
					],
					[],
				),
			],
			[
				'fat:city-opposite-separated-road-second-to-first-reverse',
				A(
					[
						[0.295, -0.234],
						[-0.226, -0.262],
					],
					[[-0.08, 0.113]],
					[
						[0.129, 0.217],
						[-0.302, 0.155],
					],
					[],
				),
			],
			[
				'thin:city-opposite-separated-road-third-to-first',
				A(
					[
						[0.369, -0.081],
						[-0.297, -0.144],
					],
					[[-0.096, 0.065]],
					[
						[-0.561, 0.044],
						[0.161, 0.176],
					],
					[],
				),
			],
			[
				'fat:city-opposite-separated-road-third-to-first',
				A(
					[
						[0.277, -0.247],
						[-0.244, -0.254],
					],
					[[-0.015, 0.177]],
					[
						[-0.293, 0.163],
						[0.2, 0.274],
					],
					[],
				),
			],
			[
				'thin:city-opposite-separated-road-third-to-first-reverse',
				A(
					[
						[0.406, -0.122],
						[-0.434, -0.059],
					],
					[[0.066, 0.059]],
					[
						[0.587, 0.045],
						[-0.156, 0.177],
					],
					[],
				),
			],
			[
				'fat:city-opposite-separated-road-third-to-first-reverse',
				A(
					[
						[0.258, -0.254],
						[-0.263, -0.212],
					],
					[[-0.02, 0.086]],
					[
						[0.286, 0.149],
						[-0.165, 0.357],
					],
					[],
				),
			],
			[
				'thin:city-opposite-separated-two-road-ends',
				A(
					[
						[0.402, -0.1],
						[-0.383, -0.128],
					],
					[
						[0.242, 0.08],
						[-0.251, 0.073],
					],
					[
						[-0.008, 0.108],
						[0.596, 0.039],
						[-0.571, 0.053],
					],
					[],
				),
			],
			[
				'fat:city-opposite-separated-two-road-ends',
				A(
					[
						[0.254, -0.267],
						[-0.219, -0.253],
					],
					[
						[0.17, 0.289],
						[-0.121, 0.157],
					],
					[
						[-0.003, 0.497],
						[0.372, 0.178],
						[-0.371, 0.192],
					],
					[],
				),
			],
			[
				'thin:city-opposite-connected-road-second-end',
				A(
					[[-0.179, -0.156]],
					[[0.196, 0.094]],
					[
						[-0.263, 0.08],
						[0.592, 0.025],
					],
					[],
				),
			],
			[
				'fat:city-opposite-connected-road-second-end',
				A(
					[[0.0, -0.42]],
					[[0.047, 0.121]],
					[
						[-0.175, 0.273],
						[0.36, 0.065],
					],
					[],
				),
			],
			[
				'thin:city-opposite-connected-road-second-end-reverse',
				A(
					[[0.17, -0.164]],
					[[-0.108, 0.086]],
					[
						[0.254, 0.093],
						[-0.601, 0.044],
					],
					[],
				),
			],
			[
				'fat:city-opposite-connected-road-second-end-reverse',
				A(
					[[0.015, -0.372]],
					[[-0.068, 0.141]],
					[
						[0.175, 0.287],
						[-0.332, 0.107],
					],
					[],
				),
			],
			[
				'thin:city-opposite-connected-two-road-ends',
				A(
					[[0.089, -0.165]],
					[
						[0.36, 0.092],
						[-0.314, 0.064],
					],
					[
						[-0.001, 0.126],
						[0.603, 0.036],
						[-0.605, 0.043],
					],
					[],
				),
			],
			[
				'fat:city-opposite-connected-two-road-ends',
				A(
					[[0.017, -0.381]],
					[
						[0.198, 0.244],
						[-0.135, 0.092],
					],
					[
						[0.01, 0.425],
						[0.372, 0.071],
						[-0.371, 0.078],
					],
					[],
				),
			],
			[
				'thin:monastery-two-road-ends',
				A(
					[],
					[
						[0.335, 0.071],
						[-0.402, 0.099],
					],
					[
						[0.612, -0.054],
						[-0.075, 0.217],
					],
					[[0.008, -0.02]],
				),
			],
			[
				'fat:monastery-two-road-ends',
				A(
					[],
					[
						[0.235, 0.31],
						[-0.223, 0.282],
					],
					[
						[-0.265, -0.211],
						[-0.008, 0.456],
					],
					[[0.006, -0.002]],
				),
			],
		]),
	],
	[('cyber', new Map())],
]);

export function manualFeatureAnchorsFor(shape, kind, themeId = 'default') {
	const key = `${shape}:${kind}`;
	const themed = MANUAL_FEATURE_ANCHORS.get(themeId)?.get(key);
	const anchors = themed || DEFAULT_MANUAL_FEATURE_ANCHORS.get(key);
	if (!anchors) throw new Error(`Missing manual anchors: ${shape}:${kind}`);
	return structuredClone(anchors);
}
export function themedManualFeatureAnchorsFor(shape, kind, themeId) {
	if (!themeId || themeId === 'default') return null;
	const anchors = MANUAL_FEATURE_ANCHORS.get(themeId)?.get(`${shape}:${kind}`);
	return anchors ? structuredClone(anchors) : null;
}
function explicitAnchorsFor(shape, kind, themeId = 'default') {
	return manualFeatureAnchorsFor(shape, kind, themeId);
}

function scoreFieldGroupsFor(kind, definition) {
	if (!definition.featureGroups.field.length) return [];
	const groups = SCORE_FIELD_GROUPS[kind];
	if (!groups) throw new Error(`Missing score-field definition: ${kind}`);
	if (groups.length !== definition.featureGroups.field.length)
		throw new Error(`Score-field group count mismatch: ${kind}`);
	return groups.map((group) => [...group]);
}

function scoreFieldCityAdjacency(shape, definition, groups) {
	const edges = edgeNames(shape);
	// 小領域は両隣の辺に接する。都市グループごとに、その都市辺へ実際に接する
	// 小領域だけを得点対象の草原として登録する。
	return Object.fromEntries(
		groups.map((subregions, fieldIndex) => [
			fieldIndex,
			(definition.featureGroups.city || [])
				.map((cityEdges, cityIndex) => ({ cityEdges, cityIndex }))
				.filter(({ cityEdges }) =>
					subregions.some((subregion) => {
						const vertexIndex = subregion - 1;
						return (
							cityEdges.includes(edges[vertexIndex]) ||
							cityEdges.includes(edges[(vertexIndex + 3) % 4])
						);
					}),
				)
				.map(({ cityIndex }) => cityIndex),
		]),
	);
}

// 各データは画面方向ではなく、頂点の組で辺を表す。
const dataFor = (shape, kind) => {
	const [first, second, third, fourth] = edgeNames(shape);
	const allField = () => fields([[first, second, third, fourth]]);
	switch (kind) {
		case 'straight-road':
			return {
				edgeTerrain: { [first]: 'R', [second]: 'F', [third]: 'R', [fourth]: 'F' },
				featureGroups: {
					city: [],
					road: [[first, third]],
					field: fields([
						{ boundaryEdges: [second], anchor: { x: 0.28, y: 0 } },
						{ boundaryEdges: [fourth], anchor: { x: -0.28, y: 0 } },
					]),
				},
				roadTerminals: {
					0: [
						{ kind: 'edge', edge: first },
						{ kind: 'edge', edge: third },
					],
				},
				fieldCityAdjacency: { 0: [], 1: [] },
			};
		case 'straight-road-reverse':
			return {
				edgeTerrain: { [first]: 'F', [second]: 'R', [third]: 'F', [fourth]: 'R' },
				featureGroups: {
					city: [],
					road: [[second, fourth]],
					field: fields([
						{ boundaryEdges: [first], anchor: { x: -0.28, y: 0 } },
						{ boundaryEdges: [third], anchor: { x: 0.28, y: 0 } },
					]),
				},
				roadTerminals: {
					0: [
						{ kind: 'edge', edge: second },
						{ kind: 'edge', edge: fourth },
					],
				},
				fieldCityAdjacency: { 0: [], 1: [] },
			};
		case 'curve-road-c':
			return {
				edgeTerrain: { [first]: 'R', [second]: 'R', [third]: 'F', [fourth]: 'F' },
				featureGroups: {
					city: [],
					road: [[first, second]],
					field: fields([
						{ boundaryEdges: [third], anchor: { x: 0.08, y: 0.28 } },
						{ boundaryEdges: [fourth], anchor: { x: -0.28, y: -0.08 } },
					]),
				},
				roadTerminals: {
					0: [
						{ kind: 'edge', edge: first },
						{ kind: 'edge', edge: second },
					],
				},
				fieldCityAdjacency: { 0: [], 1: [] },
			};
		case 'curve-road-v':
			return {
				edgeTerrain: { [first]: 'F', [second]: 'R', [third]: 'R', [fourth]: 'F' },
				featureGroups: {
					city: [],
					road: [[third, second]],
					field: fields([
						{ boundaryEdges: [first], anchor: { x: -0.08, y: -0.28 } },
						{ boundaryEdges: [fourth], anchor: { x: -0.28, y: -0.08 } },
					]),
				},
				roadTerminals: {
					0: [
						{ kind: 'edge', edge: third },
						{ kind: 'edge', edge: second },
					],
				},
				fieldCityAdjacency: { 0: [], 1: [] },
			};
		case 'city-one-side':
			return {
				edgeTerrain: { [first]: 'C', [second]: 'F', [third]: 'F', [fourth]: 'F' },
				featureGroups: { city: [[first]], road: [], field: fields([[second, third, fourth]]) },
				roadTerminals: {},
				fieldCityAdjacency: { 0: [0] },
			};
		case 'city-one-side-reverse':
			return {
				edgeTerrain: { [first]: 'F', [second]: 'F', [third]: 'F', [fourth]: 'C' },
				featureGroups: { city: [[fourth]], road: [], field: fields([[second, third, first]]) },
				roadTerminals: {},
				fieldCityAdjacency: { 0: [0] },
			};
		case 'city-one-side-straight-road':
			return {
				edgeTerrain: { [first]: 'C', [second]: 'R', [third]: 'F', [fourth]: 'R' },
				featureGroups: {
					city: [[first]],
					road: [[fourth, second]],
					field: fields([
						{ boundaryEdges: [third], anchor: { x: 0, y: 0.28 } },
						{ boundaryEdges: [], anchor: { x: 0, y: -0.22 } },
					]),
				},
				roadTerminals: {
					0: [
						{ kind: 'edge', edge: fourth },
						{ kind: 'edge', edge: second },
					],
				},
				fieldCityAdjacency: { 0: [0], 1: [0] },
			};
		case 'city-one-side-straight-road-reverse':
			return {
				edgeTerrain: { [first]: 'R', [second]: 'F', [third]: 'R', [fourth]: 'C' },
				featureGroups: {
					city: [[fourth]],
					road: [[first, third]],
					field: fields([
						{ boundaryEdges: [second], anchor: { x: -0.28, y: 0 } },
						{ boundaryEdges: [], anchor: { x: 0, y: -0.22 } },
					]),
				},
				roadTerminals: {
					0: [
						{ kind: 'edge', edge: first },
						{ kind: 'edge', edge: third },
					],
				},
				fieldCityAdjacency: { 0: [0], 1: [0] },
			};
		case 'city-one-side-curve-road-c':
			return {
				edgeTerrain: { [first]: 'R', [second]: 'R', [third]: 'F', [fourth]: 'C' },
				featureGroups: {
					city: [[fourth]],
					road: [[second, first]],
					field: fields([
						{ boundaryEdges: [third], anchor: { x: -0.26, y: -0.05 } },
						{ boundaryEdges: [], anchor: { x: 0.2, y: -0.18 } },
					]),
				},
				roadTerminals: {
					0: [
						{ kind: 'edge', edge: second },
						{ kind: 'edge', edge: first },
					],
				},
				fieldCityAdjacency: { 0: [0], 1: [0] },
			};
		case 'city-one-side-curve-road-v':
			return {
				edgeTerrain: { [first]: 'C', [second]: 'R', [third]: 'R', [fourth]: 'F' },
				featureGroups: {
					city: [[first]],
					road: [[second, third]],
					field: fields([
						{ boundaryEdges: [fourth], anchor: { x: -0.26, y: 0.05 } },
						{ boundaryEdges: [], anchor: { x: 0.2, y: -0.18 } },
					]),
				},
				roadTerminals: {
					0: [
						{ kind: 'edge', edge: second },
						{ kind: 'edge', edge: third },
					],
				},
				fieldCityAdjacency: { 0: [0], 1: [0] },
			};
		case 'city-one-side-curve-road-c-reverse':
			return {
				edgeTerrain: { [first]: 'C', [second]: 'F', [third]: 'R', [fourth]: 'R' },
				featureGroups: {
					city: [[first]],
					road: [[fourth, third]],
					field: fields([
						{ boundaryEdges: [second], anchor: { x: 0.26, y: -0.05 } },
						{ boundaryEdges: [], anchor: { x: -0.2, y: 0.18 } },
					]),
				},
				roadTerminals: {
					0: [
						{ kind: 'edge', edge: fourth },
						{ kind: 'edge', edge: third },
					],
				},
				fieldCityAdjacency: { 0: [0], 1: [0] },
			};
		case 'city-one-side-curve-road-v-reverse':
			return {
				edgeTerrain: { [first]: 'F', [second]: 'R', [third]: 'R', [fourth]: 'C' },
				featureGroups: {
					city: [[fourth]],
					road: [[second, third]],
					field: fields([
						{ boundaryEdges: [first], anchor: { x: -0.26, y: 0.05 } },
						{ boundaryEdges: [], anchor: { x: 0.2, y: -0.18 } },
					]),
				},
				roadTerminals: {
					0: [
						{ kind: 'edge', edge: second },
						{ kind: 'edge', edge: third },
					],
				},
				fieldCityAdjacency: { 0: [0], 1: [0] },
			};
		case 'city-road-end-c':
			return {
				edgeTerrain: { [first]: 'C', [second]: 'R', [third]: 'F', [fourth]: 'F' },
				featureGroups: {
					city: [[first]],
					road: [[second]],
					field: fields([
						{ boundaryEdges: [third], anchor: { x: 0.08, y: 0.28 } },
						{ boundaryEdges: [fourth], anchor: { x: -0.28, y: -0.08 } },
					]),
				},
				roadTerminals: {
					0: [
						{ kind: 'edge', edge: second },
						{ kind: 'city', cityGroup: 0 },
					],
				},
				fieldCityAdjacency: { 0: [0], 1: [0] },
			};
		case 'city-road-end-c-reverse':
			return {
				edgeTerrain: { [first]: 'F', [second]: 'F', [third]: 'R', [fourth]: 'C' },
				featureGroups: {
					city: [[fourth]],
					road: [[third]],
					field: fields([
						{ boundaryEdges: [first], anchor: { x: 0.28, y: -0.08 } },
						{ boundaryEdges: [second], anchor: { x: -0.08, y: 0.28 } },
					]),
				},
				roadTerminals: {
					0: [
						{ kind: 'edge', edge: third },
						{ kind: 'city', cityGroup: 0 },
					],
				},
				fieldCityAdjacency: { 0: [0], 1: [0] },
			};
		case 'city-road-end-v':
			return {
				edgeTerrain: { [first]: 'C', [second]: 'F', [third]: 'F', [fourth]: 'R' },
				featureGroups: {
					city: [[first]],
					road: [[fourth]],
					field: fields([
						{ boundaryEdges: [third], anchor: { x: 0.08, y: 0.28 } },
						{ boundaryEdges: [second], anchor: { x: -0.28, y: -0.08 } },
					]),
				},
				roadTerminals: {
					0: [
						{ kind: 'edge', edge: fourth },
						{ kind: 'city', cityGroup: 0 },
					],
				},
				fieldCityAdjacency: { 0: [0], 1: [0] },
			};
		case 'city-road-end-v-reverse':
			return {
				edgeTerrain: { [first]: 'R', [second]: 'F', [third]: 'F', [fourth]: 'C' },
				featureGroups: {
					city: [[fourth]],
					road: [[first]],
					field: fields([
						{ boundaryEdges: [third], anchor: { x: 0.28, y: -0.08 } },
						{ boundaryEdges: [second], anchor: { x: -0.08, y: 0.28 } },
					]),
				},
				roadTerminals: {
					0: [
						{ kind: 'edge', edge: first },
						{ kind: 'city', cityGroup: 0 },
					],
				},
				fieldCityAdjacency: { 0: [0], 1: [0] },
			};
		case 'city-one-two-road-ends':
			return {
				edgeTerrain: { [first]: 'C', [second]: 'R', [third]: 'R', [fourth]: 'F' },
				featureGroups: {
					city: [[first]],
					road: [[second], [third]],
					field: fields([[fourth], [], []]),
				},
				roadTerminals: {
					0: [
						{ kind: 'edge', edge: second },
						{ kind: 'city', cityGroup: 0 },
					],
					1: [
						{ kind: 'edge', edge: third },
						{ kind: 'city', cityGroup: 0 },
					],
				},
				fieldCityAdjacency: { 0: [0], 1: [0], 2: [0] },
			};
		case 'city-one-two-road-ends-reverse':
			return {
				edgeTerrain: { [first]: 'F', [second]: 'R', [third]: 'R', [fourth]: 'C' },
				featureGroups: {
					city: [[fourth]],
					road: [[second], [third]],
					field: fields([[first], [], []]),
				},
				roadTerminals: {
					0: [
						{ kind: 'edge', edge: second },
						{ kind: 'city', cityGroup: 0 },
					],
					1: [
						{ kind: 'edge', edge: third },
						{ kind: 'city', cityGroup: 0 },
					],
				},
				fieldCityAdjacency: { 0: [0], 1: [0], 2: [0] },
			};
		case 'city-road-end-third':
			return {
				edgeTerrain: { [first]: 'C', [second]: 'F', [third]: 'R', [fourth]: 'F' },
				featureGroups: { city: [[first]], road: [[third]], field: fields([[second], [fourth]]) },
				roadTerminals: {
					0: [
						{ kind: 'edge', edge: third },
						{ kind: 'city', cityGroup: 0 },
					],
				},
				fieldCityAdjacency: { 0: [0], 1: [0] },
			};
		case 'city-road-end-third-reverse':
			return {
				edgeTerrain: { [first]: 'F', [second]: 'R', [third]: 'F', [fourth]: 'C' },
				featureGroups: { city: [[fourth]], road: [[second]], field: fields([[first], [third]]) },
				roadTerminals: {
					0: [
						{ kind: 'edge', edge: second },
						{ kind: 'city', cityGroup: 0 },
					],
				},
				fieldCityAdjacency: { 0: [0], 1: [0] },
			};
		case 'city-opposite-separated-curve-road':
			return {
				edgeTerrain: { [first]: 'C', [second]: 'R', [third]: 'R', [fourth]: 'C' },
				featureGroups: {
					city: [[first], [fourth]],
					road: [[second, third]],
					field: fields([[], []]),
				},
				roadTerminals: {
					0: [
						{ kind: 'edge', edge: second },
						{ kind: 'edge', edge: third },
					],
				},
				fieldCityAdjacency: { 0: [0, 1], 1: [0, 1] },
			};
		case 'city-opposite-separated-road-second-to-first':
			return {
				edgeTerrain: { [first]: 'C', [second]: 'R', [third]: 'F', [fourth]: 'C' },
				featureGroups: {
					city: [[first], [fourth]],
					road: [[second]],
					field: fields([[third], []]),
				},
				roadTerminals: {
					0: [
						{ kind: 'edge', edge: second },
						{ kind: 'city', cityGroup: 0 },
					],
				},
				fieldCityAdjacency: { 0: [0, 1], 1: [0] },
			};
		case 'city-opposite-separated-road-second-to-first-reverse':
			return {
				edgeTerrain: { [first]: 'C', [second]: 'F', [third]: 'R', [fourth]: 'C' },
				featureGroups: {
					city: [[first], [fourth]],
					road: [[third]],
					field: fields([[second], []]),
				},
				roadTerminals: {
					0: [
						{ kind: 'edge', edge: third },
						{ kind: 'city', cityGroup: 1 },
					],
				},
				fieldCityAdjacency: { 0: [0], 1: [1] },
			};
		case 'city-opposite-separated-road-third-to-first':
			return {
				edgeTerrain: { [first]: 'C', [second]: 'F', [third]: 'R', [fourth]: 'C' },
				featureGroups: {
					city: [[first], [fourth]],
					road: [[third]],
					field: fields([[second], []]),
				},
				roadTerminals: {
					0: [
						{ kind: 'edge', edge: third },
						{ kind: 'city', cityGroup: 0 },
					],
				},
				fieldCityAdjacency: { 0: [0], 1: [1] },
			};
		case 'city-opposite-separated-road-third-to-first-reverse':
			return {
				edgeTerrain: { [first]: 'C', [second]: 'R', [third]: 'F', [fourth]: 'C' },
				featureGroups: {
					city: [[first], [fourth]],
					road: [[second]],
					field: fields([[third], []]),
				},
				roadTerminals: {
					0: [
						{ kind: 'edge', edge: second },
						{ kind: 'city', cityGroup: 1 },
					],
				},
				fieldCityAdjacency: { 0: [0], 1: [1] },
			};
		case 'city-opposite-separated-two-road-ends':
			return {
				edgeTerrain: { [first]: 'C', [second]: 'R', [third]: 'R', [fourth]: 'C' },
				featureGroups: {
					city: [[first], [fourth]],
					road: [[second], [third]],
					field: fields([[], [], []]),
				},
				roadTerminals: {
					0: [
						{ kind: 'edge', edge: second },
						{ kind: 'city', cityGroup: 0 },
					],
					1: [
						{ kind: 'edge', edge: third },
						{ kind: 'city', cityGroup: 1 },
					],
				},
				fieldCityAdjacency: { 0: [0, 1], 1: [0], 2: [1] },
			};
		case 'city-opposite-connected-road-second-end':
			return {
				edgeTerrain: { [first]: 'C', [second]: 'R', [third]: 'F', [fourth]: 'C' },
				featureGroups: { city: [[first, fourth]], road: [[second]], field: fields([[third], []]) },
				roadTerminals: {
					0: [
						{ kind: 'edge', edge: second },
						{ kind: 'city', cityGroup: 0 },
					],
				},
				fieldCityAdjacency: { 0: [0], 1: [0] },
			};
		case 'city-opposite-connected-road-second-end-reverse':
			return {
				edgeTerrain: { [first]: 'C', [second]: 'F', [third]: 'R', [fourth]: 'C' },
				featureGroups: { city: [[first, fourth]], road: [[third]], field: fields([[second], []]) },
				roadTerminals: {
					0: [
						{ kind: 'edge', edge: third },
						{ kind: 'city', cityGroup: 0 },
					],
				},
				fieldCityAdjacency: { 0: [0], 1: [0] },
			};
		case 'city-opposite-connected-two-road-ends':
			return {
				edgeTerrain: { [first]: 'C', [second]: 'R', [third]: 'R', [fourth]: 'C' },
				featureGroups: {
					city: [[first, fourth]],
					road: [[second], [third]],
					field: fields([[], [], []]),
				},
				roadTerminals: {
					0: [
						{ kind: 'edge', edge: second },
						{ kind: 'city', cityGroup: 0 },
					],
					1: [
						{ kind: 'edge', edge: third },
						{ kind: 'city', cityGroup: 0 },
					],
				},
				fieldCityAdjacency: { 0: [0], 1: [0], 2: [0] },
			};
		case 'monastery-two-road-ends':
			return {
				edgeTerrain: { [first]: 'F', [second]: 'R', [third]: 'R', [fourth]: 'F' },
				featureGroups: { city: [], road: [[second], [third]], field: fields([[first], [fourth]]) },
				roadTerminals: {
					0: [{ kind: 'edge', edge: second }, { kind: 'monastery' }],
					1: [{ kind: 'edge', edge: third }, { kind: 'monastery' }],
				},
				fieldCityAdjacency: { 0: [], 1: [] },
				hasMonastery: true,
			};
		case 't-junction':
			return {
				edgeTerrain: { [first]: 'F', [second]: 'R', [third]: 'R', [fourth]: 'R' },
				featureGroups: {
					city: [],
					road: [[third], [fourth], [second]],
					field: fields([
						{ boundaryEdges: [first], anchor: { x: 0, y: -0.3 } },
						{ boundaryEdges: [], anchor: { x: -0.2, y: 0.16 } },
						{ boundaryEdges: [], anchor: { x: 0.2, y: 0.16 } },
					]),
				},
				roadTerminals: Object.fromEntries(
					[third, fourth, second].map((edge, index) => [
						index,
						[
							{ kind: 'edge', edge },
							{ kind: 'intersection', intersectionId: 'junction-0' },
						],
					]),
				),
				fieldCityAdjacency: { 0: [], 1: [], 2: [] },
			};
		case 't-junction-reverse':
			return {
				edgeTerrain: { [first]: 'R', [second]: 'R', [third]: 'R', [fourth]: 'F' },
				featureGroups: {
					city: [],
					road: [[first], [second], [third]],
					field: fields([
						{ boundaryEdges: [fourth], anchor: { x: 0, y: 0.3 } },
						{ boundaryEdges: [], anchor: { x: 0.2, y: -0.16 } },
						{ boundaryEdges: [], anchor: { x: -0.2, y: -0.16 } },
					]),
				},
				roadTerminals: Object.fromEntries(
					[first, second, third].map((edge, index) => [
						index,
						[
							{ kind: 'edge', edge },
							{ kind: 'intersection', intersectionId: 'junction-0' },
						],
					]),
				),
				fieldCityAdjacency: { 0: [], 1: [], 2: [] },
			};
		case 'city-four-connected':
			return {
				edgeTerrain: { [first]: 'C', [second]: 'C', [third]: 'C', [fourth]: 'C' },
				featureGroups: { city: [[first, second, third, fourth]], road: [], field: [] },
				roadTerminals: {},
				fieldCityAdjacency: {},
			};
		case 'city-three-connected':
			return {
				edgeTerrain: { [first]: 'C', [second]: 'F', [third]: 'C', [fourth]: 'C' },
				featureGroups: { city: [[third, fourth, first]], road: [], field: fields([[second]]) },
				roadTerminals: {},
				fieldCityAdjacency: { 0: [0] },
			};
		case 'city-three-connected-reverse':
			return {
				edgeTerrain: { [first]: 'C', [second]: 'C', [third]: 'F', [fourth]: 'C' },
				featureGroups: { city: [[second, fourth, first]], road: [], field: fields([[third]]) },
				roadTerminals: {},
				fieldCityAdjacency: { 0: [0] },
			};
		case 'city-three-road':
			return {
				edgeTerrain: { [first]: 'C', [second]: 'R', [third]: 'C', [fourth]: 'C' },
				featureGroups: {
					city: [[third, fourth, first]],
					road: [[second]],
					field: fields([
						{ boundaryEdges: [], anchor: { x: 0.2, y: 0.15 } },
						{ boundaryEdges: [], anchor: { x: -0.2, y: -0.15 } },
					]),
				},
				roadTerminals: {
					0: [
						{ kind: 'edge', edge: second },
						{ kind: 'city', cityGroup: 0 },
					],
				},
				fieldCityAdjacency: { 0: [0], 1: [0] },
			};
		case 'city-three-road-reverse':
			return {
				edgeTerrain: { [first]: 'C', [second]: 'C', [third]: 'R', [fourth]: 'C' },
				featureGroups: {
					city: [[second, fourth, first]],
					road: [[third]],
					field: fields([
						{ boundaryEdges: [], anchor: { x: -0.2, y: 0.15 } },
						{ boundaryEdges: [], anchor: { x: 0.2, y: -0.15 } },
					]),
				},
				roadTerminals: {
					0: [
						{ kind: 'edge', edge: third },
						{ kind: 'city', cityGroup: 0 },
					],
				},
				fieldCityAdjacency: { 0: [0], 1: [0] },
			};
		case 'city-opposite-connected':
			return {
				edgeTerrain: { [first]: 'C', [second]: 'F', [third]: 'C', [fourth]: 'F' },
				featureGroups: {
					city: [[first, third]],
					road: [],
					field: fields([
						{ boundaryEdges: [second], anchor: { x: 0.28, y: 0 } },
						{ boundaryEdges: [fourth], anchor: { x: -0.28, y: 0 } },
					]),
				},
				roadTerminals: {},
				fieldCityAdjacency: { 0: [0], 1: [0] },
			};
		case 'city-opposite-connected-reverse':
			return {
				edgeTerrain: { [first]: 'F', [second]: 'C', [third]: 'F', [fourth]: 'C' },
				featureGroups: {
					city: [[second, fourth]],
					road: [],
					field: fields([
						{ boundaryEdges: [first], anchor: { x: -0.28, y: 0 } },
						{ boundaryEdges: [third], anchor: { x: 0.28, y: 0 } },
					]),
				},
				roadTerminals: {},
				fieldCityAdjacency: { 0: [0], 1: [0] },
			};
		case 'city-opposite-separated':
			return {
				edgeTerrain: { [first]: 'C', [second]: 'F', [third]: 'C', [fourth]: 'F' },
				featureGroups: { city: [[first], [third]], road: [], field: fields([[second, fourth]]) },
				roadTerminals: {},
				fieldCityAdjacency: { 0: [0, 1] },
			};
		case 'city-opposite-separated-reverse':
			return {
				edgeTerrain: { [first]: 'F', [second]: 'C', [third]: 'F', [fourth]: 'C' },
				featureGroups: { city: [[second], [fourth]], road: [], field: fields([[first, third]]) },
				roadTerminals: {},
				fieldCityAdjacency: { 0: [0, 1] },
			};
		case 'city-adjacent-connected-c':
			return {
				edgeTerrain: { [first]: 'C', [second]: 'C', [third]: 'F', [fourth]: 'F' },
				featureGroups: { city: [[first, second]], road: [], field: fields([[third, fourth]]) },
				roadTerminals: {},
				fieldCityAdjacency: { 0: [0] },
			};
		case 'city-adjacent-connected-v':
			return {
				edgeTerrain: { [first]: 'C', [second]: 'F', [third]: 'F', [fourth]: 'C' },
				featureGroups: { city: [[first, fourth]], road: [], field: fields([[third, second]]) },
				roadTerminals: {},
				fieldCityAdjacency: { 0: [0] },
			};
		case 'city-adjacent-curve-road-c':
			return {
				edgeTerrain: { [first]: 'C', [second]: 'C', [third]: 'R', [fourth]: 'R' },
				featureGroups: {
					city: [[first, second]],
					road: [[third, fourth]],
					field: fields([
						{ boundaryEdges: [], anchor: { x: -0.2, y: 0.16 } },
						{ boundaryEdges: [], anchor: { x: 0.2, y: -0.16 } },
					]),
				},
				roadTerminals: {
					0: [
						{ kind: 'edge', edge: third },
						{ kind: 'edge', edge: fourth },
					],
				},
				fieldCityAdjacency: { 0: [0], 1: [0] },
			};
		case 'city-adjacent-curve-road-v':
			return {
				edgeTerrain: { [first]: 'C', [second]: 'R', [third]: 'R', [fourth]: 'C' },
				featureGroups: {
					city: [[first, fourth]],
					road: [[third, second]],
					field: fields([
						{ boundaryEdges: [], anchor: { x: 0.2, y: 0.16 } },
						{ boundaryEdges: [], anchor: { x: -0.2, y: -0.16 } },
					]),
				},
				roadTerminals: {
					0: [
						{ kind: 'edge', edge: third },
						{ kind: 'edge', edge: second },
					],
				},
				fieldCityAdjacency: { 0: [0], 1: [0] },
			};
		case 'city-adjacent-separated-c':
			return {
				edgeTerrain: { [first]: 'C', [second]: 'C', [third]: 'F', [fourth]: 'F' },
				featureGroups: { city: [[first], [second]], road: [], field: fields([[third, fourth]]) },
				roadTerminals: {},
				fieldCityAdjacency: { 0: [0, 1] },
			};
		case 'city-adjacent-separated-v':
			return {
				edgeTerrain: { [first]: 'C', [second]: 'F', [third]: 'F', [fourth]: 'C' },
				featureGroups: { city: [[first], [fourth]], road: [], field: fields([[third, second]]) },
				roadTerminals: {},
				fieldCityAdjacency: { 0: [0, 1] },
			};
		case 'city-one-t-junction':
			return {
				edgeTerrain: { [first]: 'C', [second]: 'R', [third]: 'R', [fourth]: 'R' },
				featureGroups: {
					city: [[first]],
					road: [[second], [third], [fourth]],
					field: fields([
						{ boundaryEdges: [], anchor: { x: 0.22, y: -0.12 } },
						{ boundaryEdges: [], anchor: { x: 0.1, y: 0.24 } },
						{ boundaryEdges: [], anchor: { x: -0.22, y: 0.08 } },
					]),
				},
				roadTerminals: Object.fromEntries(
					[second, third, fourth].map((edge, index) => [
						index,
						[
							{ kind: 'edge', edge },
							{ kind: 'intersection', intersectionId: 'junction-0' },
						],
					]),
				),
				fieldCityAdjacency: { 0: [0], 1: [0], 2: [0] },
			};
		case 'city-one-t-junction-reverse':
			return {
				edgeTerrain: { [first]: 'R', [second]: 'R', [third]: 'R', [fourth]: 'C' },
				featureGroups: {
					city: [[fourth]],
					road: [[second], [third], [first]],
					field: fields([
						{ boundaryEdges: [], anchor: { x: -0.22, y: -0.12 } },
						{ boundaryEdges: [], anchor: { x: -0.1, y: 0.24 } },
						{ boundaryEdges: [], anchor: { x: 0.22, y: 0.08 } },
					]),
				},
				roadTerminals: Object.fromEntries(
					[second, third, first].map((edge, index) => [
						index,
						[
							{ kind: 'edge', edge },
							{ kind: 'intersection', intersectionId: 'junction-0' },
						],
					]),
				),
				fieldCityAdjacency: { 0: [0], 1: [0], 2: [0] },
			};
		case 'cross-junction':
			return {
				edgeTerrain: { [first]: 'R', [second]: 'R', [third]: 'R', [fourth]: 'R' },
				featureGroups: {
					city: [],
					road: [[first], [second], [third], [fourth]],
					field: fields([
						{ boundaryEdges: [], anchor: { x: 0.2, y: -0.2 } },
						{ boundaryEdges: [], anchor: { x: 0.2, y: 0.2 } },
						{ boundaryEdges: [], anchor: { x: -0.2, y: 0.2 } },
						{ boundaryEdges: [], anchor: { x: -0.2, y: -0.2 } },
					]),
				},
				roadTerminals: Object.fromEntries(
					[first, second, third, fourth].map((edge, index) => [
						index,
						[
							{ kind: 'edge', edge },
							{ kind: 'intersection', intersectionId: 'cross-0' },
						],
					]),
				),
				fieldCityAdjacency: { 0: [], 1: [], 2: [], 3: [] },
			};
		case 'monastery-field':
			return {
				edgeTerrain: { [first]: 'F', [second]: 'F', [third]: 'F', [fourth]: 'F' },
				featureGroups: { city: [], road: [], field: allField() },
				roadTerminals: {},
				fieldCityAdjacency: { 0: [] },
				hasMonastery: true,
			};
		case 'monastery-road-end':
			return {
				edgeTerrain: { [first]: 'F', [second]: 'R', [third]: 'F', [fourth]: 'F' },
				featureGroups: {
					city: [],
					road: [[second]],
					field: fields([{ boundaryEdges: [first, third, fourth], anchor: { x: -0.12, y: 0.16 } }]),
				},
				roadTerminals: {
					0: [{ kind: 'edge', edge: second }, { kind: 'monastery' }],
				},
				fieldCityAdjacency: { 0: [] },
				hasMonastery: true,
			};
		case 'monastery-road-end-reverse':
			return {
				edgeTerrain: { [first]: 'F', [second]: 'F', [third]: 'R', [fourth]: 'F' },
				featureGroups: {
					city: [],
					road: [[third]],
					field: fields([
						{ boundaryEdges: [fourth, first, second], anchor: { x: -0.12, y: -0.16 } },
					]),
				},
				roadTerminals: {
					0: [{ kind: 'edge', edge: third }, { kind: 'monastery' }],
				},
				fieldCityAdjacency: { 0: [] },
				hasMonastery: true,
			};
		default:
			throw new Error(`Unknown tile kind: ${kind}`);
	}
};

// 暫定タイルセット。各定義をシン・ファットへ割り当てる。
const CATALOG_DEFINITIONS = [
	['straight-road', 2, 'thin'],
	['straight-road', 2, 'fat'],
	['straight-road-reverse', 2, 'thin'],
	['straight-road-reverse', 2, 'fat'],
	['curve-road-c', 2, 'thin'],
	['curve-road-c', 2, 'fat'],
	['curve-road-v', 2, 'thin'],
	['curve-road-v', 2, 'fat'],
	['city-one-side', 2, 'thin'],
	['city-one-side', 2, 'fat'],
	['city-one-side-reverse', 2, 'thin'],
	['city-one-side-reverse', 2, 'fat'],
	['city-one-side-straight-road', 1, 'thin'],
	['city-one-side-straight-road', 1, 'fat'],
	['city-one-side-straight-road-reverse', 1, 'thin'],
	['city-one-side-straight-road-reverse', 1, 'fat'],
	['city-one-side-curve-road-c', 1, 'thin'],
	['city-one-side-curve-road-c', 1, 'fat'],
	['city-one-side-curve-road-v', 1, 'thin'],
	['city-one-side-curve-road-v', 1, 'fat'],
	['city-one-side-curve-road-c-reverse', 1, 'thin'],
	['city-one-side-curve-road-c-reverse', 1, 'fat'],
	['city-one-side-curve-road-v-reverse', 1, 'thin'],
	['city-one-side-curve-road-v-reverse', 1, 'fat'],
	['city-road-end-c', 1, 'thin'],
	['city-road-end-c', 1, 'fat'],
	['city-road-end-c-reverse', 1, 'thin'],
	['city-road-end-c-reverse', 1, 'fat'],
	['city-road-end-v', 1, 'thin'],
	['city-road-end-v', 1, 'fat'],
	['city-road-end-v-reverse', 1, 'thin'],
	['city-road-end-v-reverse', 1, 'fat'],
	['city-one-two-road-ends', 1, 'thin'],
	['city-one-two-road-ends', 1, 'fat'],
	['city-one-two-road-ends-reverse', 1, 'thin'],
	['city-one-two-road-ends-reverse', 1, 'fat'],
	['city-road-end-third', 1, 'thin'],
	['city-road-end-third', 1, 'fat'],
	['city-road-end-third-reverse', 1, 'thin'],
	['city-road-end-third-reverse', 1, 'fat'],
	['city-opposite-separated-curve-road', 1, 'thin'],
	['city-opposite-separated-curve-road', 1, 'fat'],
	['city-opposite-separated-road-second-to-first', 1, 'thin'],
	['city-opposite-separated-road-second-to-first', 1, 'fat'],
	['city-opposite-separated-road-second-to-first-reverse', 1, 'thin'],
	['city-opposite-separated-road-second-to-first-reverse', 1, 'fat'],
	['city-opposite-separated-road-third-to-first', 1, 'thin'],
	['city-opposite-separated-road-third-to-first', 1, 'fat'],
	['city-opposite-separated-road-third-to-first-reverse', 1, 'thin'],
	['city-opposite-separated-road-third-to-first-reverse', 1, 'fat'],
	['city-opposite-separated-two-road-ends', 1, 'thin'],
	['city-opposite-separated-two-road-ends', 1, 'fat'],
	['city-opposite-connected-road-second-end', 1, 'thin'],
	['city-opposite-connected-road-second-end', 1, 'fat'],
	['city-opposite-connected-road-second-end-reverse', 1, 'thin'],
	['city-opposite-connected-road-second-end-reverse', 1, 'fat'],
	['city-opposite-connected-two-road-ends', 1, 'thin'],
	['city-opposite-connected-two-road-ends', 1, 'fat'],
	['monastery-two-road-ends', 1, 'thin'],
	['monastery-two-road-ends', 1, 'fat'],
	['t-junction', 1, 'thin'],
	['t-junction', 1, 'fat'],
	['t-junction-reverse', 1, 'thin'],
	['t-junction-reverse', 1, 'fat'],
	['city-four-connected', 1, 'thin'],
	['city-four-connected', 1, 'fat'],
	['city-three-connected', 1, 'thin'],
	['city-three-connected', 1, 'fat'],
	['city-three-connected-reverse', 1, 'thin'],
	['city-three-connected-reverse', 1, 'fat'],
	['city-three-road', 1, 'thin'],
	['city-three-road', 1, 'fat'],
	['city-three-road-reverse', 1, 'thin'],
	['city-three-road-reverse', 1, 'fat'],
	['city-opposite-connected', 1, 'thin'],
	['city-opposite-connected', 1, 'fat'],
	['city-opposite-connected-reverse', 1, 'thin'],
	['city-opposite-connected-reverse', 1, 'fat'],
	['city-opposite-separated', 1, 'thin'],
	['city-opposite-separated', 1, 'fat'],
	['city-opposite-separated-reverse', 1, 'thin'],
	['city-opposite-separated-reverse', 1, 'fat'],
	['city-adjacent-connected-c', 1, 'thin'],
	['city-adjacent-connected-c', 1, 'fat'],
	['city-adjacent-connected-v', 1, 'thin'],
	['city-adjacent-connected-v', 1, 'fat'],
	['city-adjacent-curve-road-c', 1, 'thin'],
	['city-adjacent-curve-road-c', 1, 'fat'],
	['city-adjacent-curve-road-v', 1, 'thin'],
	['city-adjacent-curve-road-v', 1, 'fat'],
	['city-adjacent-separated-c', 1, 'thin'],
	['city-adjacent-separated-c', 1, 'fat'],
	['city-adjacent-separated-v', 1, 'thin'],
	['city-adjacent-separated-v', 1, 'fat'],
	['city-one-t-junction', 1, 'thin'],
	['city-one-t-junction', 1, 'fat'],
	['city-one-t-junction-reverse', 1, 'thin'],
	['city-one-t-junction-reverse', 1, 'fat'],
	['cross-junction', 1, 'thin'],
	['cross-junction', 1, 'fat'],
	['monastery-field', 1, 'thin'],
	['monastery-field', 1, 'fat'],
	['monastery-road-end', 1, 'thin'],
	['monastery-road-end', 1, 'fat'],
	['monastery-road-end-reverse', 1, 'thin'],
	['monastery-road-end-reverse', 1, 'fat'],
];

// Standard のタイル一覧
const STANDARD_DEFINITIONS = [
	['straight-road', 3, 'thin'],
	['straight-road', 5, 'fat'],
	['curve-road-c', 1, 'thin'],
	['curve-road-c', 2, 'fat'],
	['curve-road-v', 2, 'thin'],
	['curve-road-v', 4, 'fat'],
	['city-one-side', 2, 'thin'],
	['city-one-side', 3, 'fat'],
	['city-one-side-straight-road', 2, 'thin'],
	['city-one-side-straight-road', 2, 'fat'],
	['city-one-side-curve-road-v', 1, 'thin'],
	['city-one-side-curve-road-v', 2, 'fat'],
	['city-one-side-curve-road-c-reverse', 1, 'thin'],
	['city-one-side-curve-road-c-reverse', 2, 'fat'],
	['city-road-end-c', 1, 'thin'],
	['city-road-end-c', 2, 'fat'],
	['city-road-end-v', 1, 'thin'],
	['city-road-end-v', 1, 'fat'],
	['t-junction', 2, 'thin'],
	['t-junction', 2, 'fat'],
	['city-four-connected', 1, 'fat'],
	['city-three-connected', 2, 'thin'],
	['city-three-connected', 2, 'fat'],
	['city-three-road', 1, 'thin'],
	['city-three-road', 2, 'fat'],
	['city-opposite-connected', 1, 'thin'],
	['city-opposite-connected', 2, 'fat'],
	['city-opposite-separated', 1, 'thin'],
	['city-opposite-separated', 2, 'fat'],
	['city-adjacent-connected-c', 1, 'thin'],
	['city-adjacent-connected-c', 1, 'fat'],
	['city-adjacent-connected-v', 1, 'thin'],
	['city-adjacent-connected-v', 2, 'fat'],
	['city-adjacent-curve-road-c', 1, 'thin'],
	['city-adjacent-curve-road-c', 1, 'fat'],
	['city-adjacent-curve-road-v', 1, 'thin'],
	['city-adjacent-curve-road-v', 2, 'fat'],
	['city-adjacent-separated-c', 1, 'thin'],
	['city-adjacent-separated-c', 1, 'fat'],
	['city-adjacent-separated-v', 1, 'thin'],
	['city-adjacent-separated-v', 1, 'fat'],
	['city-one-t-junction', 1, 'thin'],
	['city-one-t-junction', 2, 'fat'],
	['cross-junction', 1, 'fat'],
	['monastery-field', 1, 'thin'],
	['monastery-field', 1, 'fat'],
	['monastery-road-end', 1, 'thin'],
	['monastery-road-end', 1, 'fat'],
	['city-road-end-third', 1, 'thin'],
	['city-road-end-third', 2, 'fat'],
	['city-opposite-connected-road-second-end', 1, 'thin'],
	['city-opposite-connected-road-second-end', 2, 'fat'],
	['monastery-two-road-ends', 1, 'thin'],
	['monastery-two-road-ends', 1, 'fat'],
];

// 拡張版のタイル一覧。Standard より大きい独立した山札。
// ここだけを直接編集して構成を調整できる。
const EXPANSION_DEFINITIONS = [
	['straight-road', 5, 'thin'],
	['straight-road', 8, 'fat'],
	['curve-road-c', 2, 'thin'],
	['curve-road-c', 3, 'fat'],
	['curve-road-v', 3, 'thin'],
	['curve-road-v', 6, 'fat'],
	['city-one-side', 3, 'thin'],
	['city-one-side', 5, 'fat'],
	['city-one-side-straight-road', 3, 'thin'],
	['city-one-side-straight-road', 3, 'fat'],
	['city-one-side-curve-road-v', 2, 'thin'],
	['city-one-side-curve-road-v', 3, 'fat'],
	['city-one-side-curve-road-c-reverse', 2, 'thin'],
	['city-one-side-curve-road-c-reverse', 3, 'fat'],
	['t-junction', 3, 'thin'],
	['t-junction', 3, 'fat'],
	['city-four-connected', 2, 'fat'],
	['city-three-connected', 3, 'thin'],
	['city-three-connected', 3, 'fat'],
	['city-three-road', 2, 'thin'],
	['city-three-road', 3, 'fat'],
	['city-opposite-connected', 2, 'thin'],
	['city-opposite-connected', 3, 'fat'],
	['city-opposite-separated', 2, 'thin'],
	['city-opposite-separated', 3, 'fat'],
	['city-adjacent-connected-c', 2, 'thin'],
	['city-adjacent-connected-c', 2, 'fat'],
	['city-adjacent-connected-v', 2, 'thin'],
	['city-adjacent-connected-v', 3, 'fat'],
	['city-adjacent-curve-road-c', 2, 'thin'],
	['city-adjacent-curve-road-c', 2, 'fat'],
	['city-adjacent-curve-road-v', 1, 'thin'],
	['city-adjacent-curve-road-v', 3, 'fat'],
	['city-adjacent-separated-c', 1, 'thin'],
	['city-adjacent-separated-c', 1, 'fat'],
	['city-adjacent-separated-v', 1, 'thin'],
	['city-adjacent-separated-v', 1, 'fat'],
	['city-one-t-junction', 1, 'thin'],
	['city-one-t-junction', 3, 'fat'],
	['cross-junction', 1, 'fat'],
	['monastery-field', 1, 'thin'],
	['monastery-field', 1, 'fat'],
	['monastery-road-end', 1, 'thin'],
	['monastery-road-end', 1, 'fat'],
	['city-road-end-third', 1, 'thin'],
	['city-road-end-third', 3, 'fat'],
	['city-opposite-connected-road-second-end', 1, 'thin'],
	['city-opposite-connected-road-second-end', 3, 'fat'],
	['monastery-two-road-ends', 1, 'thin'],
	['monastery-two-road-ends', 1, 'fat'],
];

// Liteのタイルセット
const LITE_DEFINITIONS = [
	['straight-road', 2, 'thin'],
	['straight-road', 4, 'fat'],
	['curve-road-c', 1, 'thin'],
	['curve-road-c', 2, 'fat'],
	['curve-road-v', 2, 'thin'],
	['curve-road-v', 4, 'fat'],
	['city-one-side', 2, 'thin'],
	['city-one-side', 3, 'fat'],
	['city-one-side-straight-road', 1, 'thin'],
	['city-one-side-straight-road', 2, 'fat'],
	['city-one-side-curve-road-c', 1, 'thin'],
	['city-one-side-curve-road-c', 2, 'fat'],
	['city-one-side-curve-road-v', 1, 'thin'],
	['city-one-side-curve-road-v', 2, 'fat'],
	['t-junction', 1, 'thin'],
	['t-junction', 1, 'fat'],
	['city-opposite-separated', 1, 'thin'],
	['city-opposite-separated', 1, 'fat'],
	['city-adjacent-connected-c', 1, 'thin'],
	['city-adjacent-connected-c', 1, 'fat'],
	['city-adjacent-connected-v', 1, 'thin'],
	['city-adjacent-connected-v', 2, 'fat'],
	['city-adjacent-curve-road-c', 1, 'thin'],
	['city-adjacent-curve-road-c', 1, 'fat'],
	['city-adjacent-curve-road-v', 1, 'thin'],
	['city-adjacent-curve-road-v', 1, 'fat'],
	['city-road-end-third', 1, 'thin'],
	['city-road-end-third', 2, 'fat'],
	['city-opposite-connected-road-second-end', 1, 'thin'],
	['city-opposite-connected-road-second-end', 2, 'fat'],
];

// 道だけデッキ: 道系は各3枚、交差点は各2枚、修道院は各1枚。
// どの種類もシン／ファットを同数含めるため、計42枚（各形状21枚）になる。
const ROAD_ONLY_DEFINITIONS = [
	['straight-road', 3, 'thin'],
	['straight-road', 5, 'fat'],
	['straight-road-reverse', 3, 'thin'],
	['straight-road-reverse', 5, 'fat'],
	['curve-road-c', 3, 'thin'],
	['curve-road-c', 5, 'fat'],
	['curve-road-v', 3, 'thin'],
	['curve-road-v', 5, 'fat'],
	['t-junction', 2, 'thin'],
	['t-junction', 3, 'fat'],
	['t-junction-reverse', 2, 'thin'],
	['t-junction-reverse', 3, 'fat'],
	['cross-junction', 2, 'thin'],
	['cross-junction', 3, 'fat'],
	['monastery-field', 1, 'thin'],
	['monastery-field', 1, 'fat'],
	['monastery-road-end', 1, 'thin'],
	['monastery-road-end', 1, 'fat'],
	['monastery-road-end-reverse', 1, 'thin'],
	['monastery-road-end-reverse', 1, 'fat'],
];

export const TILE_DECK_TYPES = Object.freeze({
	lite: 'lite',
	standard: 'standard',
	expansion: 'expansion',
	roadOnly: 'road-only',
});
const DECK_DEFINITIONS = Object.freeze({
	lite: LITE_DEFINITIONS,
	standard: STANDARD_DEFINITIONS,
	expansion: EXPANSION_DEFINITIONS,
	'road-only': ROAD_ONLY_DEFINITIONS,
});
export const DECK_CONFIGS = Object.freeze(
	[
		['lite', 'Lite', '短時間向け'],
		['standard', 'Standard', '暫定基本セット'],
		['expansion', '拡張版', '長時間向け'],
		['road-only', '道だけ', '道／交差点／修道院のみ'],
	].map(([id, label, summary]) => {
		const count = DECK_DEFINITIONS[id].reduce((total, [, copies]) => total + copies, 0);
		return Object.freeze({ id, label, count, description: `${count}枚・${summary}` });
	}),
);

function definitionsFor(deckType) {
	const definitions = DECK_DEFINITIONS[deckType];
	if (!definitions) throw new Error(`Unknown deck type: ${deckType}`);
	return definitions;
}

export function createPrototypeDeck(random = Math.random, deckType = 'standard') {
	if (typeof random === 'string') [deckType, random] = [random, Math.random];
	let serial = 0;
	return definitionsFor(deckType).flatMap(([idPrefix, count, shape]) =>
		Array.from({ length: count }, () => {
			const definition = dataFor(shape, idPrefix),
				fieldScoreGroups = scoreFieldGroupsFor(idPrefix, definition);
			return createTile(
				{
					idPrefix,
					count,
					shape,
					hasCrest: false,
					hasMonastery: false,
					...definition,
					featureAnchors: explicitAnchorsFor(shape, idPrefix),
					fieldScoreGroups,
					fieldScoreCityAdjacency: scoreFieldCityAdjacency(shape, definition, fieldScoreGroups),
				},
				`${shape}-${idPrefix}-${String(++serial).padStart(3, '0')}`,
				random() >= 0.5,
			);
		}),
	);
}

// デバッグ用。Lite / Standard の採用状況にかかわらず、手動アンカーを持つ全種別を返す。
export function createTileCatalog(random = Math.random) {
	let serial = 0;
	return CATALOG_DEFINITIONS.flatMap(([idPrefix, count, shape]) =>
		Array.from({ length: count }, () => {
			const definition = dataFor(shape, idPrefix),
				fieldScoreGroups = scoreFieldGroupsFor(idPrefix, definition);
			return createTile(
				{
					idPrefix,
					count,
					shape,
					hasCrest: false,
					hasMonastery: false,
					...definition,
					featureAnchors: explicitAnchorsFor(shape, idPrefix),
					fieldScoreGroups,
					fieldScoreCityAdjacency: scoreFieldCityAdjacency(shape, definition, fieldScoreGroups),
				},
				`${shape}-${idPrefix}-catalog-${String(++serial).padStart(3, '0')}`,
				random() >= 0.5,
			);
		}),
	);
}

export function manualAnchorOrder(tile) {
	return [...DEFAULT_MANUAL_FEATURE_ANCHORS.keys()].indexOf(`${tile.shape}:${tile.idPrefix}`);
}

// 左右反転は、辺を first ⇄ fourth / second ⇄ third、頂点側の小領域を
// ① ⇄ ① / ② ⇄ ④ / ③ ⇄ ③ と対応させる。タイルのローカル座標では x を反転する。
export function mirrorTile(tile) {
	const mirrored = structuredClone(tile);
	const names = edgeNames(tile.shape),
		edgeMap = Object.fromEntries(names.map((name, index) => [name, names[3 - index]]));
	const subregionMap = { 1: 1, 2: 4, 3: 3, 4: 2 };
	const mapEdges = (edges = []) => edges.map((edge) => edgeMap[edge] || edge);
	const mapGroup = (group) =>
		Array.isArray(group)
			? mapEdges(group)
			: {
					...group,
					boundaryEdges: mapEdges(group.boundaryEdges),
					anchor: group.anchor ? { ...group.anchor, x: -group.anchor.x } : group.anchor,
				};

	mirrored.edgeTerrain = Object.fromEntries(
		names.map((name) => [edgeMap[name], tile.edgeTerrain[name]]),
	);
	mirrored.featureGroups = Object.fromEntries(
		Object.entries(tile.featureGroups || {}).map(([type, groups]) => [type, groups.map(mapGroup)]),
	);
	mirrored.featureAnchors = Object.fromEntries(
		Object.entries(tile.featureAnchors || {}).map(([type, anchors]) => [
			type,
			anchors.map((anchor) => (anchor ? { ...anchor, x: -anchor.x } : anchor)),
		]),
	);
	mirrored.roadTerminals = Object.fromEntries(
		Object.entries(tile.roadTerminals || {}).map(([index, terminals]) => [
			index,
			terminals.map((terminal) =>
				terminal.edge ? { ...terminal, edge: edgeMap[terminal.edge] } : { ...terminal },
			),
		]),
	);
	mirrored.fieldScoreGroups = (tile.fieldScoreGroups || []).map((group) =>
		group.map((subregion) => subregionMap[subregion]),
	);
	mirrored.fieldScoreCityAdjacency = scoreFieldCityAdjacency(
		tile.shape,
		mirrored,
		mirrored.fieldScoreGroups,
	);
	mirrored.fieldCityAdjacency = structuredClone(tile.fieldCityAdjacency || {});
	mirrored.mirrored = !tile.mirrored;
	mirrored.originalId = tile.originalId || tile.id;
	mirrored.id = mirrored.mirrored ? `${mirrored.originalId}-mirror` : mirrored.originalId;
	const idPrefix = tile.idPrefix || tile.originalId || tile.id || 'tile';
	mirrored.idPrefix = mirrored.mirrored
		? `${idPrefix.replace(/-mirror$/, '')}-mirror`
		: idPrefix.replace(/-mirror$/, '');
	return mirrored;
}

// ミラー版はデッキへ加えない。仮置き候補と空白防止の判定だけが利用する。
export function createPrototypeMirrorTiles(random = Math.random, deckType = 'standard') {
	return createPrototypeDeck(random, deckType).map((tile) => mirrorTile(tile));
}

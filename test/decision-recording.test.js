import test from 'node:test';
import assert from 'node:assert/strict';
import { Board } from '../src/game/Board.js';
import { GameEngine } from '../src/game/GameEngine.js';
import { captureDecisionContext, describeTileCandidate, RECORD_VERSION, setAssessmentRating } from '../src/recording/DecisionData.js';
import { scenarioCandidates, validateScenarioBoard } from '../src/recording/ScenarioEditor.js';

test('局面編集は合法な隣接を認め、重なりを拒む', () => {
	const game = new GameEngine({ deckType: 'lite', deferCandidateSearch: true, random: () => 0 });
	const board = new Board(120);
	board.add(game.state.board.tiles[0]);
	const candidate = scenarioCandidates(board, game.state.currentTile)[0];
	assert.ok(candidate, '編集画面から合法な隣接候補を出せる');
	board.add(candidate);
	assert.equal(validateScenarioBoard(board).valid, true);
	board.add({ ...candidate, id: 'overlap-copy' });
	assert.equal(validateScenarioBoard(board).valid, false);
});

test('判断記録は各候補を個別に保持し、山札の順番を出さない', () => {
	const game = new GameEngine({ deckType: 'lite', deferCandidateSearch: true, random: () => 0 });
	const candidate = scenarioCandidates(game.state.board, game.state.currentTile)[0];
	const first = describeTileCandidate(game, candidate, 0);
	const second = describeTileCandidate(game, candidate, 1);
	assert.notEqual(first.id, second.id);
	assert.equal(first.rating, 'unreviewed');
	assert.ok(Array.isArray(first.features.adjacentEdges));
	const context = captureDecisionContext(game);
	assert.equal(context.remainingDeckCount, game.state.deck.length);
	assert.equal(Object.hasOwn(context, 'deck'), false);
});

test('組の評価では選択候補が常に一つだけになる', () => {
	assert.equal(RECORD_VERSION, 2);
	const assessments = {
		'0:skip:-': { id: '0:skip:-', rating: 'unreviewed' },
		'1:road:0': { id: '1:road:0', rating: 'unreviewed' },
		'2:city:0': { id: '2:city:0', rating: 'unreviewed' },
	};
	setAssessmentRating(assessments, '0:skip:-', 'confident');
	setAssessmentRating(assessments, '1:road:0', 'runner-up');
	assert.equal(assessments['0:skip:-'].rating, 'confident');
	setAssessmentRating(assessments, '2:city:0', 'uncertain');
	assert.equal(assessments['0:skip:-'].rating, 'unreviewed');
	assert.equal(assessments['1:road:0'].rating, 'runner-up');
	assert.equal(assessments['2:city:0'].rating, 'uncertain');
});

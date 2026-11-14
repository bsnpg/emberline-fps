// Rounds and the match: buy phase, live round, round end, next round, match end.
// First to 5 rounds wins the match (at most 9 rounds; 4–4 goes to a decider).
// A round ends when one team is wiped out, the spike explodes or is defused, or
// the clock runs out with no plant. The spike's own 40-second timer decides a
// planted round; the round clock stops once it is planted.
export const BUY_SECONDS = 15;
export const ROUND_SECONDS = 100;
export const ROUNDS_TO_WIN = 5;
export const MAX_ROUNDS = 9;

export function createRounds() {
  const state = {
    phase: 'menu', // menu | buy | live | ended | match
    round: 1,
    scoreAzure: 0,
    scoreEmber: 0,
    clock: BUY_SECONDS,
    endReason: '',
    endWinner: null,
    matchWinner: null,
    roundKills: 0,
  };

  return {
    state,
    startMatch() {
      state.phase = 'buy';
      state.round = 1;
      state.scoreAzure = 0;
      state.scoreEmber = 0;
      state.clock = BUY_SECONDS;
      state.endReason = '';
      state.endWinner = null;
      state.matchWinner = null;
      state.roundKills = 0;
    },
    startRound() {
      state.phase = 'buy';
      state.clock = BUY_SECONDS;
      state.endReason = '';
      state.endWinner = null;
      state.roundKills = 0;
    },
    beginLive() {
      state.phase = 'live';
      state.clock = ROUND_SECONDS;
    },
    endRound(winner, reason) {
      if (state.phase === 'ended' || state.phase === 'match') return false;
      state.phase = 'ended';
      state.endWinner = winner;
      state.endReason = reason;
      if (winner === 'azure') state.scoreAzure += 1;
      else state.scoreEmber += 1;
      if (state.scoreAzure >= ROUNDS_TO_WIN || state.scoreEmber >= ROUNDS_TO_WIN || state.round >= MAX_ROUNDS) {
        state.phase = 'match';
        state.matchWinner = state.scoreAzure > state.scoreEmber ? 'azure' : state.scoreEmber > state.scoreAzure ? 'ember' : 'draw';
      }
      return true;
    },
    nextRound() {
      state.round += 1;
      this.startRound();
    },
    tick(dt) {
      if (state.phase === 'buy' || state.phase === 'live') {
        state.clock = Math.max(0, state.clock - dt);
      }
    },
  };
}

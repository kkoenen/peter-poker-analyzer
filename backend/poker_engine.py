import random
from treys import Card, Evaluator

ALL_RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A']
ALL_SUITS = ['s', 'h', 'd', 'c']

_FULL_DECK = [Card.new(r + s) for r in ALL_RANKS for s in ALL_SUITS]
_EVALUATOR = Evaluator()


def calculate_odds(
    hole_cards: list[str],
    community_cards: list[str],
    num_players: int,
    simulations: int = 6000,
) -> tuple[float, float]:
    """
    Monte Carlo win probability for hero's hand.

    Args:
        hole_cards:       2 card strings in treys format, e.g. ['As', 'Kh']
        community_cards:  0, 3, 4 or 5 known board cards
        num_players:      total players at the table (including hero)
        simulations:      MC iterations

    Returns:
        (win_pct, tie_pct)  as floats 0.0–1.0
    """
    my_hand = [Card.new(c) for c in hole_cards]
    board_known = [Card.new(c) for c in community_cards]
    known_set = set(my_hand + board_known)

    remaining = [c for c in _FULL_DECK if c not in known_set]

    board_to_deal = 5 - len(board_known)
    opp_cards_needed = (num_players - 1) * 2
    total_needed = board_to_deal + opp_cards_needed

    if len(remaining) < total_needed:
        return 0.0, 0.0

    wins = ties = valid = 0

    for _ in range(simulations):
        sample = random.sample(remaining, total_needed)
        sim_board = board_known + sample[:board_to_deal]
        opp_flat = sample[board_to_deal:]

        try:
            my_score = _EVALUATOR.evaluate(sim_board, my_hand)
        except Exception:
            continue

        best_opp = float('inf')
        for i in range(num_players - 1):
            opp = opp_flat[i * 2: i * 2 + 2]
            try:
                s = _EVALUATOR.evaluate(sim_board, opp)
                if s < best_opp:
                    best_opp = s
            except Exception:
                pass

        valid += 1
        if best_opp == float('inf') or my_score < best_opp:
            wins += 1
        elif my_score == best_opp:
            ties += 1

    if valid == 0:
        return 0.0, 0.0

    return wins / valid, ties / valid


def get_suggestion(
    win_pct: float,
    num_players: int,
    bet_mult: float = 1.5,
    check_mult: float = 0.85,
) -> tuple[str, str]:
    """
    Return (action, reason) scaled to break-even for num_players.

    Break-even point = 1/num_players.
    """
    breakeven = 1.0 / num_players

    if win_pct >= breakeven * bet_mult:
        return "BET", "Strong hand — press your advantage"
    if win_pct >= breakeven * check_mult:
        return "CHECK", "Marginal spot — play it safe"
    return "FOLD", "Odds are against you"

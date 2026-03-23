import os
import yaml
from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from poker_engine import calculate_odds, get_suggestion

# ─── Config ───────────────────────────────────────────────────────────────────
_DIR = os.path.dirname(__file__)
_CONFIG_PATH = os.path.join(_DIR, '..', 'config.yaml')
_FRONTEND_DIR = os.path.join(_DIR, '..', 'frontend')

with open(_CONFIG_PATH) as f:
    cfg = yaml.safe_load(f)

# ─── App ──────────────────────────────────────────────────────────────────────
app = FastAPI(title=cfg['app']['name'], docs_url=None, redoc_url=None)


# ─── Models ───────────────────────────────────────────────────────────────────
class OddsRequest(BaseModel):
    hole_cards: list[str]
    community_cards: list[str]
    num_players: int


# ─── API routes (must come before static mount) ───────────────────────────────
@app.post('/api/odds')
async def post_odds(req: OddsRequest):
    if len(req.hole_cards) != 2:
        raise HTTPException(400, 'hole_cards must contain exactly 2 cards')
    if len(req.community_cards) not in (0, 3, 4, 5):
        raise HTTPException(400, 'community_cards must be 0, 3, 4 or 5 cards')
    if not (cfg['poker']['min_players'] <= req.num_players <= cfg['poker']['max_players']):
        raise HTTPException(400, f"num_players must be {cfg['poker']['min_players']}–{cfg['poker']['max_players']}")

    win, tie = calculate_odds(
        req.hole_cards,
        req.community_cards,
        req.num_players,
        simulations=cfg['poker']['monte_carlo_simulations'],
    )

    action, reason = get_suggestion(
        win,
        req.num_players,
        bet_mult=cfg['suggestion']['bet_multiplier'],
        check_mult=cfg['suggestion']['check_multiplier'],
    )

    return {
        'win_pct': round(win * 100, 1),
        'tie_pct': round(tie * 100, 1),
        'action': action,
        'reason': reason,
    }


@app.get('/api/config')
async def get_config():
    return {
        'app_name': cfg['app']['name'],
        'min_players': cfg['poker']['min_players'],
        'max_players': cfg['poker']['max_players'],
        'default_players': cfg['poker']['default_players'],
        'rag_green': cfg['rag']['green_threshold'],
        'rag_amber': cfg['rag']['amber_threshold'],
    }


# ─── Static frontend (catch-all, must be last) ────────────────────────────────
app.mount('/', StaticFiles(directory=_FRONTEND_DIR, html=True), name='static')

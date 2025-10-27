from __future__ import annotations

import json
import subprocess
from functools import lru_cache
from pathlib import Path
from typing import Iterable

from py_mini_racer import py_mini_racer

from .types import BetDecision, StrategyCallable, StrategyContext

PROJECT_ROOT = Path(__file__).resolve().parents[2]
PLUGIN_ROOT = PROJECT_ROOT / "strategy_plugins"
CACHE_ROOT = PLUGIN_ROOT / ".cache"


def _ensure_directories() -> None:
    PLUGIN_ROOT.mkdir(parents=True, exist_ok=True)
    CACHE_ROOT.mkdir(parents=True, exist_ok=True)


def _transpile_typescript(ts_path: Path, js_path: Path) -> None:
    script = (
        "const fs = require('fs');"
        "const path = require('path');"
        "const ts = require('typescript');"
        f"const inputPath = {json.dumps(str(ts_path))};"
        f"const outputPath = {json.dumps(str(js_path))};"
        "const source = fs.readFileSync(inputPath, 'utf8');"
        "const result = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 } });"
        "fs.mkdirSync(path.dirname(outputPath), { recursive: true });"
        "fs.writeFileSync(outputPath, result.outputText, 'utf8');"
    )
    try:
        subprocess.run(["node", "-e", script], check=True, cwd=str(PROJECT_ROOT))
    except FileNotFoundError as exc:  # noqa: BLE001
        raise RuntimeError("Cần cài đặt Node.js để biên dịch plugin TypeScript") from exc
    except subprocess.CalledProcessError as exc:  # noqa: BLE001
        raise RuntimeError(
            "Không thể biên dịch plugin TypeScript. Đảm bảo đã chạy `npm install` để có module typescript."
        ) from exc


def _load_plugin_source(plugin_id: str) -> str:
    _ensure_directories()
    ts_path = PLUGIN_ROOT / f"{plugin_id}.ts"
    js_source_path = CACHE_ROOT / f"{plugin_id}.js"
    if ts_path.exists():
        if not js_source_path.exists() or ts_path.stat().st_mtime > js_source_path.stat().st_mtime:
            _transpile_typescript(ts_path, js_source_path)
        return js_source_path.read_text(encoding="utf-8")
    js_path = PLUGIN_ROOT / f"{plugin_id}.js"
    if js_path.exists():
        return js_path.read_text(encoding="utf-8")
    raise FileNotFoundError(f"Không tìm thấy plugin {plugin_id}. Vui lòng đặt file {plugin_id}.ts hoặc {plugin_id}.js trong strategy_plugins/")


@lru_cache(maxsize=8)
def _build_plugin_runner(plugin_id: str) -> tuple[py_mini_racer.MiniRacer, str]:
    source = _load_plugin_source(plugin_id)
    ctx = py_mini_racer.MiniRacer()
    bootstrap = (
        "var module = { exports: {} };"
        "var exports = module.exports;"
        f"{source}\n"
        "var __pluginStrategy = module.exports && module.exports.default ? module.exports.default : module.exports;"
        "if (typeof __pluginStrategy !== 'function') { throw new Error('Plugin must export a function as default'); }"
        "function __invokeStrategy(context) { return __pluginStrategy(context); }"
    )
    ctx.eval(bootstrap)
    return ctx, "__invokeStrategy"


def load_plugin_strategy(plugin_id: str) -> StrategyCallable:
    ctx, function_name = _build_plugin_runner(plugin_id)

    def _runner(context: StrategyContext) -> Iterable[BetDecision]:
        payload = context.to_plugin_payload()
        result = ctx.call(function_name, payload)
        if not isinstance(result, list):
            raise ValueError("Plugin strategy phải trả về danh sách các lệnh cược")
        decisions: list[BetDecision] = []
        for item in result:
            if not isinstance(item, dict):
                continue
            number = str(item.get("number", "")).strip()
            stake = float(item.get("stake", 0.0))
            if not number or stake <= 0:
                continue
            decisions.append(BetDecision(number=number, stake=stake))
        return decisions

    return _runner

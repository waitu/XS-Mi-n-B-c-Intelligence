# XS Miền Bắc Backend

## Setup

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -e .[dev]
```

## Running

```powershell
uvicorn app.main:app --reload
```

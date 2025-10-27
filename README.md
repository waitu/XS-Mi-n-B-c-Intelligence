# XS Miền Bắc Intelligence

Công cụ tổng hợp, phân tích và dự đoán xổ số miền Bắc. Dự án gồm:

- **Backend** (`backend/`): FastAPI + SQLModel xử lý ingest dữ liệu, lưu trữ SQLite và cung cấp API thống kê, dự đoán.
- **Frontend** (`frontend/`): React + TypeScript + Vite với giao diện tối, hiện đại để trực quan hóa thống kê, bảng kết quả và gợi ý đầu số.

## Yêu cầu hệ thống

- Python 3.11+
- Node.js 18+ và npm 9+

## Thiết lập backend

```powershell
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -e .
```

Khởi chạy API:

```powershell
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Các endpoint chính:

- `GET /results` – Danh sách kỳ quay, lọc theo ngày.
- `GET /stats/summary` – Tổng quan dữ liệu.
- `GET /stats/tail-frequencies` – Tần suất đuôi.
- `GET /predictions/heads` – Gợi ý đầu số.
- `POST /analytics/backtest/heads` – Backtest dựa trên bảng đề xuất đầu số.
- `GET /metadata/regions` – Danh sách đài/miền xổ số có dữ liệu.
- `POST /backtest/lotto/run` – Mô phỏng chiến lược cược theo cấu hình Backtest Pro.
- `POST /ingest/refresh` – Đồng bộ dữ liệu theo khoảng ngày.
- `POST /ingest/day` – Đồng bộ chính xác một ngày.
- `POST /ingest/month` – Đồng bộ toàn bộ kỳ quay trong tháng.
- `POST /ingest/year` – Đồng bộ toàn bộ kỳ quay trong năm.

## Thiết lập frontend

```powershell
cd frontend
npm install
npm run dev
```

Ứng dụng sẽ chạy tại <http://127.0.0.1:5173> và tự động kết nối API backend mặc định `http://127.0.0.1:8000`. Có thể cấu hình lại bằng cách tạo tệp `.env` trong `frontend/`:

```dotenv
VITE_API_BASE_URL=http://localhost:8000
VITE_DEV_SERVER_HOST=127.0.0.1
VITE_DEV_SERVER_PORT=5173
```

### Backtest Pro dashboard

- Giao diện điều hướng mới nằm ở thanh trên cùng, truy cập trang backtest tại đường dẫn `/backtest-pro`.
- Tại đây có thể chọn mô hình dự đoán, chiến lược cược (cố định, Kelly, Martingale, plugin TypeScript…) và giới hạn rủi ro.
- Sau khi nhấn **Run Backtest**, hệ thống sẽ gọi API `/backtest/lotto/run`, trả về đồ thị vốn, tỷ lệ chính xác, nhật ký giao dịch và các nút xuất JSON/CSV/PDF.
- Ô **Plugin ID** dùng cho file chiến lược TypeScript tùy chỉnh đã đăng ký bên backend (thông qua cơ chế plugin loader).

## Kiểm thử

Frontend dùng Vitest + Testing Library:

```powershell
cd frontend
npm run lint    # kiểm tra TypeScript
npm run test    # chạy bộ test
```

## Đồng bộ dữ liệu hàng ngày

1. Khởi chạy backend.
2. Tại frontend, mở mục **Điều phối đồng bộ dữ liệu** để chọn kiểu crawl: ngày, tháng, năm hoặc khoảng tùy chỉnh (có tùy chọn ghi đè dữ liệu cũ). Nếu thao tác qua API, dùng các endpoint `/ingest/day`, `/ingest/month`, `/ingest/year`, `/ingest/refresh` tùy nhu cầu.
3. Sau khi đồng bộ, giao diện thống kê sẽ tự làm mới và phản hồi trạng thái thành công/thất bại.

## Tham khảo kiến trúc

Chi tiết kiến trúc, mô-đun và luồng dữ liệu: xem `docs/architecture.md`.

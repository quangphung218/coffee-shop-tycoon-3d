# Tài liệu

- [architecture.md](architecture.md): ba lớp sim/render/ui, lệnh và sự kiện, vòng ngày, tuần cuốn chiếu trong code, thống kê ngày và tuần, FSM khách, định dạng save v3 và số liệu chơi, thành phần tải và warm-up lúc khởi động, mẹo hiệu năng.
- [deploy.md](deploy.md): build, tự tăng version theo Conventional Commits và deploy lên GitHub Pages.
- [spec/week-7-days.md](spec/week-7-days.md): luật tuần: lịch mở khoá tuần 1, mở rộng quán ngày 7, sự kiện và thời tiết, mục tiêu tuần N, chấm điểm và cúp, sang tuần mới, cấp quán 7–10, nâng save cũ.
- [spec/p27-retention.md](spec/p27-retention.md): nhân viên có đặc điểm và lên cấp, quà ngày và Tem, thành tựu, đơn đặc biệt, khách VIP, nội thất mới, mở rộng quán 4 cấp: luật và bảng con số.
- [media.md](media.md): tạo lại ảnh chụp, GIF và mp4 demo trong `docs/media/`, các bảng ảnh trước/sau, review tuần 7 ngày (`review:p22`), và atlas icon 3D trong `public/icons3d/`.

## Báo cáo

- [reports/hud-390-overlap.md](reports/hud-390-overlap.md): HUD 390 px, cụm Tiến độ đè Điều khiển lúc chuẩn bị với số liệu cuối game; ba phương án sửa có ảnh mô phỏng và số đo; kết quả sửa theo phương án A (tiền gọn ở ≤ 480 px) với ảnh trước/sau.
- [reports/hud-top-row.md](reports/hud-top-row.md): HUD trên, nguyên nhân cụm Điều khiển rớt hàng ở ngày sự kiện cuối game, cách giữ ba cụm một hàng, ảnh trước/sau ở 1440 và 1100 px.
- [reports/loading-experience.md](reports/loading-experience.md): màn tải có tiến độ thật: file nặng nhất khi mở game, thời gian tới Main Menu và cảnh 3D trước/sau so với `d35f4d9`.
- [reports/startup-under-1s-plan.md](reports/startup-under-1s-plan.md): Main Menu trên di động ở 390×844: dòng thời gian tải, chunk chính chứa gì, kế hoạch đưa xuống dưới 1 s.
- [reports/p27-retention.md](reports/p27-retention.md): P27, kiểm chứng nhân viên lên cấp, quà ngày và Tem, đơn đặc biệt, khách VIP, quán mở rộng 4 cấp: check, khởi động và khung hình so với `d58350b`, layout 92 mục, ảnh có khoanh.
- [reports/p27-merge-state.md](reports/p27-merge-state.md): P27, từng nhánh hạng mục, tích hợp và verify so với `origin/main` bằng ancestry và patch-id; nhánh lượt cũ chưa merge và bản thay thế đã có trong main.
- [reports/p26-startup.md](reports/p26-startup.md): P26, Main Menu dưới 1 s ở 390×844: thời gian tới Main Menu và cảnh 3D so với `57d7559`, chunk gzip trước/sau, kết quả kiểm các ngưỡng.
- [reports/p25-progression.md](reports/p25-progression.md): P25, Menu gọn, thẻ lên cấp, hình và icon theo bậc nâng cấp, hiệu ứng mua, chấm "Mới"; ý đã làm và để sau; ảnh trước/sau P24→P25 ở 390 và 1280 px; kết quả kiểm layout, khởi động, khung hình lúc có hiệu ứng.
- [reports/p24-ui.md](reports/p24-ui.md): P24, nguyên nhân gốc và cách sửa lỗi gợi ý nhập bỏ sót Cam, Bột bánh, Bơ; thang cỡ chữ, nút, viền, bóng chung và các chỗ đã thiết kế lại; ảnh trước/sau P23→P24 ở 390 và 1280 px; kết quả kiểm layout, khởi động, khung hình.
- [reports/p23-ui.md](reports/p23-ui.md): P23, ảnh trước/sau P22→P23 có khoanh ở 390 và 1280 px: HUD 3 cụm, Daily Report gọn có Δ so hôm qua và so tuần, tổng kết tuần 1 và 2, danh sách thành phần lúc tải.
- [reports/p23-loading-frames.md](reports/p23-loading-frames.md): P23, cách đo frame time và long task 5 s đầu sau khi cảnh 3D hiện, mỗi bước warm-up trong `world.prepare()` ứng với nguồn giật nào.
- [reports/p23-long-economy.md](reports/p23-long-economy.md): P23, mô phỏng 4 tuần ở 3 độ khó × 3 chiến lược × 3 seed: doanh thu, lãi, tiền, cấp, nâng cấp còn lại, cúp; lý do chọn mục tiêu tuần, thưởng cúp và cấp 7–10.
- [reports/p22-review.md](reports/p22-review.md): P22, review tuần 7 ngày ở 390 và 1440 px: mọi vấn đề có bằng chứng và điểm tác động × công sức, phần đã sửa với ảnh trước/sau so với v0.4.0, khởi động và FPS, phần để đợt sau.
- [reports/p22-economy.md](reports/p22-economy.md): P22, mô phỏng tuần 7 ngày ở 3 độ khó × 5 chiến lược × 6 seed: doanh thu, lãi, tiền thấp nhất, cúp, và danh sách vấn đề cân bằng có số liệu.
- [reports/p21-week.md](reports/p21-week.md): P21, tuần 7 ngày: lịch mở khoá, log mô phỏng 7 ngày cùng seed và tác động từng biến số, ảnh trước/sau v0.2.0→P21 có khoanh, mẫu JSON số liệu chơi, kết quả kiểm tra.
- [reports/p20-gameplay-visual.md](reports/p20-gameplay-visual.md): P20, chấm 3D hiện trạng → cải tiến, cấp quán/nhiệm vụ/chỉ số và Cài đặt, ảnh trước/sau P19→P20 có khoanh, số đo khởi động.
- [reports/p18-collision-shop-icons.md](reports/p18-collision-shop-icons.md): P18, các ca đi xuyên đã sửa với sơ đồ đường đi trước/sau, ảnh quán trước/sau, ảnh mặt tiền ngày/tối khoanh chỗ phát sáng, kích thước atlas icon.
- [reports/p19-polish.md](reports/p19-polish.md): P19, sáu mục chỉnh sau bản P18 (lề, Kho theo nhu cầu, khung tổng cố định, người đi và bố cục bàn, thanh cuộn, xoay camera) với ảnh trước/sau có khoanh.
- [reports/p19-layout-check.md](reports/p19-layout-check.md): P19, tràn ngang ở 8 màn × 3 khổ, CLS bảng Kho khi đổi số gói, thời gian tới Main Menu so với `origin/main`.
- [reports/p18-icons-sample.png](reports/p18-icons-sample.png): SVG cũ và icon 3D mẫu cạnh nhau ở 16/24/48 px.

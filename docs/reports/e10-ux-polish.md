# E-10: đánh bóng UX sau soát (v0.18.0)

E-10 sửa giao diện sau đợt soát UX. **Không đổi kinh tế**: giá, lương, lãi, hạn mức nợ, mục tiêu tuần, công thức sim và `SAVE_VERSION` giữ nguyên. Chỉ đổi `src/ui/`, cảnh 3D (đèn chùm) và test UI; `src/sim/` không đổi. Không cần đo lại `p23-long-run` hay chỉnh `WEEK_GOAL_MULTS`.

## Thay đổi

| Mã | Sửa |
| --- | --- |
| UX-012 | Đèn chùm treo sát trần: vòng ở y = 2,9 (trần 3,4), có vòng hào quang phát sáng dùng lại `GLOW_MATERIAL` có sẵn (không thêm vật liệu mới). Chi tiết vị trí ở `docs/spec/p27-retention.md`. |
| UX-009 | Bảng Nâng cấp: các món cần cấp quán cao hơn nằm trong nhóm thu gọn "Mở ở cấp sau (N)" ở cuối, xếp theo cấp mở. Mỗi dòng khóa chỉ có một nhãn "Cần cấp quán N" (`needShopLevel`, `laterGroupTitle` trong `src/ui/panels/upgrades.ts`). |
| UX-013, 014, 015 | Chip "Thiếu" cao tối thiểu 44 px (đủ chạm). Dòng chỉ ghi cấp quán gọn lại. Nhãn "Chi phí nguyên liệu" và "Chi phí chính" thay cho "Food cost" / "Prime cost" trong báo cáo (`src/ui/report/insights.ts`); title (tooltip) vẫn giữ tên tiếng Anh Food cost / Prime cost. |
| UX-010, 011 | Tổng kết: ở 390 px các tab báo cáo nằm trên một hàng, "Sao" đứng cạnh "Khách". `.rpt-body` và `.rpt-table-wrap` có `tabindex="0"` và `aria-label` để cuộn được bằng bàn phím và đọc được bằng trình đọc màn hình. Màn cảm ứng ẩn gợi ý phím tắt. Biểu đồ tuần vẽ đúng các ngày thật đã chơi. |
| Phụ | "Khách bỏ đi": mũi tên và màu cùng nghĩa với các chỉ số khác (giảm khách bỏ đi = mũi tên lên, xanh). Khoảng cách `h3`/`p` trong footer-panel được chỉnh lại. |

## Kiểm

Test UI trong `tests/ui/` được cập nhật cho các nhãn và thuộc tính trên.

## Chưa kiểm

`npm run layout` (kiểm bố cục ở các cỡ màn hình) chưa chạy được trong sandbox, nên bố cục 390 px (tab một hàng, chip Thiếu 44 px) chưa được xác nhận bằng lệnh đó. Cần chạy lại trên máy có trình duyệt.

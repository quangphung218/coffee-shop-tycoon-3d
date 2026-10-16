# P22 — Kinh tế tuần 7 ngày theo chiến lược

Số liệu mô phỏng tuần 7 ngày ở 3 độ khó × 5 chiến lược × 6 seed (`1, 42, 777, 2024, 31337, 9001`) và danh sách vấn đề cân bằng rút ra. Luật tuần ở [spec/week-7-days.md](../spec/week-7-days.md).

## Chạy lại

```sh
npx vitest run tests/integration/p22-strategies.test.ts --silent=false --reporter=default
```

Test in bảng trung bình và bảng từng seed, chỉ assert tiền không âm và cùng seed ra cùng số.

## Chiến lược

| Id | Nhập hàng | Phục vụ | Thuê | Dụng cụ | Giá | Marketing |
| --- | --- | --- | --- | --- | --- | --- |
| a | Theo gợi ý mỗi sáng | Tự phục vụ | Không | Không | Chuẩn | Không |
| b | Theo gợi ý mỗi sáng | Tự phục vụ | 1 pha chế lương thấp nhất, sáng ngày 1 | Không | Chuẩn | Không |
| c | như b | như b | như b | Cấp 1 mỗi dụng cụ từ sáng nó mở, khi tiền − giá ≥ lương tối nay | Chuẩn | Không |
| d | như c | như c | như c | như c | Cao từ ngày 1 | Không |
| e | như c | như c | như c | như c | Chuẩn | Tờ rơi (150k, rẻ nhất) ngày 1, 3, 5, 7 |

## Trung bình 6 seed

Lãi = doanh thu − giá vốn nguyên liệu đã dùng − lương − tiền mua (dụng cụ + marketing). Tiền thấp nhất đo sau mỗi phút và mỗi lệnh. Ngày nhàm = ngày không mở khoá gì và không có sự kiện.

| Độ khó | Chiến lược | Doanh thu | Lãi | Lương | Tiền mua | Tiền thấp nhất | Tiền cuối tuần | Ly bán | Khách bỏ về | Sao cuối | Điểm | Cúp | Ngày nhàm |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Dễ | a | 22.559k | 15.518k | 0 | 0 | 2.613k | 19.821k | 759 | 10,9% | 4,05 | 88,2 | 2,00 | 0 |
| Dễ | b | 30.845k | 20.340k | 922k | 0 | 2.613k | 24.421k | 1.037 | 8,3% | 4,30 | 100,0 | 3,00 | 0 |
| Dễ | c | 33.212k | 18.423k | 922k | 3.600k | 2.493k | 22.499k | 1.111 | 8,1% | 4,33 | 100,0 | 3,00 | 0 |
| Dễ | d | 35.602k | 21.498k | 922k | 3.600k | 2.613k | 25.730k | 1.037 | 8,0% | 4,20 | 100,0 | 3,00 | 0 |
| Dễ | e | 33.817k | 18.206k | 922k | 4.200k | 2.063k | 22.456k | 1.147 | 11,3% | 4,22 | 100,0 | 3,00 | 0 |
| Thường | a | 21.177k | 13.865k | 0 | 0 | 1.690k | 17.122k | 705 | 11,2% | 4,00 | 87,7 | 2,17 | 0 |
| Thường | b | 27.333k | 16.938k | 1.027k | 0 | 1.690k | 20.067k | 902 | 7,0% | 4,32 | 99,5 | 3,00 | 0 |
| Thường | c | 29.429k | 14.378k | 1.027k | 4.000k | 1.586k | 17.451k | 968 | 7,3% | 4,35 | 100,0 | 3,00 | 0 |
| Thường | d | 30.976k | 16.767k | 1.027k | 4.000k | 1.690k | 19.984k | 898 | 6,9% | 4,18 | 99,8 | 3,00 | 0 |
| Thường | e | 29.643k | 13.895k | 1.027k | 4.600k | 1.139k | 17.005k | 991 | 11,7% | 4,25 | 99,7 | 3,00 | 0 |
| Khó | a | 18.244k | 11.006k | 0 | 0 | 947k | 13.362k | 605 | 12,9% | 4,02 | 85,7 | 2,00 | 0 |
| Khó | b | 22.403k | 12.441k | 1.167k | 0 | 947k | 14.779k | 738 | 6,3% | 4,38 | 97,3 | 3,00 | 0 |
| Khó | c | 23.858k | 8.722k | 1.167k | 4.600k | 486k | 11.046k | 797 | 6,6% | 4,42 | 99,5 | 3,00 | 0 |
| Khó | d | 25.183k | 10.865k | 1.167k | 4.600k | 869k | 13.129k | 727 | 6,8% | 4,20 | 99,3 | 3,00 | 0 |
| Khó | e | 24.106k | 8.262k | 1.167k | 5.200k | 323k | 10.742k | 802 | 12,4% | 4,28 | 99,3 | 3,00 | 0 |

Tiền đầu ván: Dễ 3.000k, Thường 2.000k, Khó 1.200k. Mục tiêu tuần: Dễ 28.000k / 3,8 sao, Thường 26.500k / 4,0 sao, Khó 23.000k / 4,2 sao.

## So sánh từng cặp (trung bình 6 seed)

| So sánh | Độ khó | Δ lãi | Δ doanh thu | Δ khách bỏ về | Δ sao | Cúp | Seed thắng |
| --- | --- | --- | --- | --- | --- | --- | --- |
| b − a (thuê 1 pha chế) | Dễ | +4.822k | +8.286k | −2,6 điểm | +0,25 | 2,00 → 3,00 | 6/6 |
| b − a | Thường | +3.073k | +6.156k | −4,2 điểm | +0,32 | 2,17 → 3,00 | 6/6 |
| b − a | Khó | +1.435k | +4.159k | −6,6 điểm | +0,36 | 2,00 → 3,00 | 6/6 |
| c − b (mua dụng cụ) | Dễ | −1.917k | +2.367k | −0,2 điểm | +0,03 | 3,00 → 3,00 | 0/6 |
| c − b | Thường | −2.560k | +2.096k | +0,3 điểm | +0,03 | 3,00 → 3,00 | 0/6 |
| c − b | Khó | −3.719k | +1.455k | +0,3 điểm | +0,04 | 3,00 → 3,00 | 0/6 |
| d − c (giá Cao) | Dễ | +3.075k | +2.390k | −0,1 điểm | −0,13 | 3,00 → 3,00 | 6/6 |
| d − c | Thường | +2.389k | +1.547k | −0,4 điểm | −0,17 | 3,00 → 3,00 | 6/6 |
| d − c | Khó | +2.143k | +1.325k | +0,2 điểm | −0,22 | 3,00 → 3,00 | 6/6 |
| e − c (tờ rơi 2 ngày/lần) | Dễ | −217k | +605k | +3,2 điểm | −0,11 | 3,00 → 3,00 | 1/6 |
| e − c | Thường | −483k | +214k | +4,4 điểm | −0,10 | 3,00 → 3,00 | 1/6 |
| e − c | Khó | −460k | +248k | +5,8 điểm | −0,14 | 3,00 → 3,00 | 1/6 |

Hoàn vốn dụng cụ trong tuần = (lãi c + tiền mua c − lãi b) / tiền mua c: Dễ 47%, Thường 36%, Khó 19%.

## Vấn đề

| Id | Mô tả | Số liệu | Impact (1–3) | Effort (1–3) |
| --- | --- | --- | --- | --- |
| E1 | Điểm tuần chạm trần: mọi chiến lược có thuê người đều 3 cúp, điểm không phân biệt chơi tốt và chơi tồi | b/c/d/e: điểm 95–100 ở 72/72 ván, 3 cúp 72/72; lãi tuần cùng nhóm chênh 7.212k–25.098k | 3 | 2 |
| E2 | Khó không khó hơn về cúp: Khó đạt 3 cúp dễ như Thường | Khó b: 3 cúp 6/6 seed, điểm 95–100; Khó a 85,7 điểm ≈ Thường a 87,7; mục tiêu doanh thu Khó 23.000k thấp hơn Thường 26.500k | 3 | 1 |
| E3 | Thuê 1 pha chế là lựa chọn không cần nghĩ: luôn lãi hơn tự làm và luôn lên 3 cúp | b − a: lãi +1.435k đến +4.822k, 18/18 ván thắng; lương tuần chỉ 922k–1.167k | 2 | 2 |
| E4 | Dụng cụ không hoàn vốn trong tuần, càng khó càng lỗ | c − b: lãi −1.917k / −2.560k / −3.719k, 0/18 ván thắng; hoàn vốn 47% / 36% / 19% | 3 | 2 |
| E5 | Máy rửa ly mở ngày 7 (ngày cuối tuần) nên mua là lỗ trọn giá; máy làm đá mở ngày 6 chỉ còn 2 ngày dùng | c/d/e: dụng cụ mua vào ngày 2, 3, 5, 6, 7 ở 50/54 ván (4 ván Khó e mua máy xay hạt muộn 1–2 ngày); máy rửa ly 800k × hệ số giá (720k–920k) mua sáng ngày 7, tuần kết thúc tối đó | 2 | 1 |
| E6 | Giá Cao luôn thắng giá Chuẩn, đánh đổi sao không đủ để thành quyết định | d − c: lãi +2.143k đến +3.075k, 18/18 ván thắng; sao −0,13 đến −0,22, cúp vẫn 3 ở 18/18 | 3 | 1 |
| E7 | Marketing rẻ nhất gần như luôn lỗ: khách thêm bỏ về vì quán đã đầy | e − c: lãi −217k đến −483k, thắng 3/18 ván; khách bỏ về +3,2 đến +5,8 điểm %; ly bán chỉ +5 đến +36 | 2 | 2 |
| E8 | Không có áp lực tiền: tiền không bao giờ xuống sát 0, cuối tuần dư gấp 6–11 lần vốn đầu | Tiền thấp nhất a/b = vốn đầu − hàng nhập ngày 1 (2.613k / 1.690k / 947k); tiền cuối tuần 10.742k–25.730k; thấp nhất toàn bộ 184k (Khó e, seed 42) | 2 | 2 |
| E9 | Điểm tuần chỉ tính doanh thu và sao, không tính lãi: chi tiền mua dụng cụ hay marketing không bao giờ bị phạt điểm | c lãi thấp hơn b 1.917k–3.719k nhưng điểm c ≥ b ở cả 3 độ khó (100,0 / 100,0 / 99,5 so với 100,0 / 99,5 / 97,3) | 2 | 2 |
| E10 | Không có ngày nhàm theo định nghĩa (không mở khoá, không sự kiện) | Ngày nhàm = 0 ở 90/90 ván: lịch mở khoá có mục mới mỗi ngày từ ngày 2, ngày 1 mở món khởi đầu | 1 | 1 |

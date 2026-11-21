# E-32: Sổ khách quen nối tiếp sau mùa 2

Phạm vi: dữ liệu sim, chuỗi khách quen, một đoạn UI thu gọn danh sách dài. `SAVE_VERSION` vẫn là 9.

## Cơ chế

- Khi khách quen mùa N (N >= 2) xong mốc 4, khách mùa N+1 dọn tới qua đổi tên kiểu `admitRegular`, sau khi RNG ngoại hình đã được tung. Vì vậy lượt khách, đơn và tiền không đổi.
- Chuỗi mỗi chỗ: khách mùa 2 thứ i -> `gen_i` -> `gen_{i+8}` -> `gen_{i+16}` -> ... (`chainSuccessor` trong `src/sim/data/regulars.ts`, `customers.ts` gọi khi khách xong mốc 4).
- Khách sinh ra là dữ liệu thuần của chỉ số k (`generatedProfile(k)` trong `src/sim/data/regularChain.ts`), không dùng RNG, không lưu thêm state.
- Chỉ trả Tem, không có phần thưởng mới.

## Luật ghép tên, nghề, chuyện

- 16 mẫu nghề (`TEMPLATES`), xen kẽ nữ/nam. Khách k dùng mẫu `k % 16`. Mỗi mẫu có: cách xưng (Cô/Chị/Anh/Chú/Em), nghề, nơi làm, món ưa thích, món ăn kèm, và câu đầu cho 4 mốc.
- Chuyện mỗi mốc gồm hai câu. Câu 1 lấy từ mẫu nghề (mốc 1: là ai, mốc 2: kể về việc, mốc 3: mang gì hoặc ai tới quán, mốc 4: bước ngoặt). Câu 2 lấy từ `BEATS`, 3 biến thể cho mỗi mốc trong 4 mốc, chọn theo `(k + mốc) % 3`.
- Tên: tên gọi lấy từ hai bảng 30 tên nữ và 30 tên nam, đã bỏ các tên của khách mùa 1-2 và hai bảng không trùng nhau. Qua vòng đầu của bảng thì thêm tên đệm ("Chị Thanh Hằng"), rồi họ ("Anh Trần Quốc Quân"). Comment trong mã ghi tên không trùng cho n < 3.330 mỗi giới.
- Nghề: sau khi dùng hết 16 mẫu một lần, mỗi vòng sau đổi nơi làm sang "trên đường số n" (n = vòng + 1), nên không hai khách nào có cùng nghề kèm nơi làm.
- Không emoji trong chuyện.
- Test: 2000 khách sinh ra không trùng (tests/sim/e32-regular-chain.test.ts).

### Tóm tắt khách mùa 3+ sinh ra

Suy ra trực tiếp từ mã, không chạy mẫu:

| k | Tên | Nghề | Số lần ghé mốc 1-4 |
|---|---|---|---|
| 0 | Chị Hằng | thợ may áo dài ở một tiệm nhỏ cuối phố | 44, 87, 121, 165 |
| 1 | Anh Quân | bác sĩ thú y ở phòng khám cuối con dốc | chưa tính |
| 16 | Chị Diệp | thợ may áo dài ở một tiệm may trên đường số 2 | chưa tính |

Ngoại hình `look = 8 + k % 8`. Danh sách đầy đủ chưa được lấy mẫu ngoài ba dòng trên.

## Công thức giãn mốc

Một công thức cố định duy nhất:

`chainVisits(i, M) = 50 + 40·M + OFFSETS[(i + 3·M) % 8]`, với `OFFSETS = [1, 2, 3, 4, 6, 7, 8, 9]`.

- Khách sinh ra k = 8·(g-1) + i giữ mốc chuỗi 4g..4g+3, nên ngưỡng của họ là hiệu của `chainVisits` trừ số lần ghé tại mốc 4 của người trước (`generatedVisits`).
- Với M = 0..3, công thức trùng đúng `MILESTONE_VISITS` của khách mùa 2 (`NEW_REGULARS[i]`).
- Luật E-27 tối đa 3 mốc mỗi tuần giữ nguyên.

## Save

- `SAVE_VERSION` vẫn 9, không có bước migrate mới.
- Test migrate: save cũ giữ mốc đã đạt, không hoàn Tem. Save mà khách đã qua mốc 4 trước E-32 được xử lý ở `customers.ts` (comment quanh dòng 416).
- 14/14 test mới của chuỗi và migrate qua.

## Sim 100 tuần (`npm run sim:long:s3`)

Script `tests/longsim/season3.s3.ts`, không nằm trong `npm run check` hay `sim:long`. Cấu hình: b_steady2, độ khó Thường, 4 seed.

Tuần 60-100 có mốc, trên 41 tuần: ngưỡng >= 60% (25/41) đạt ở cả 4 seed.

| Seed | Số tuần có mốc | Tuần nhiều mốc nhất |
|---|---|---|
| 1 | 32 | 3 |
| 42 | 33 | 3 |
| 7 | 38 | 3 |
| 2026 | 31 | 3 |

Số mốc mỗi tuần, tuần 60 đến 100:

```
s1    2 1 2 0 1 3 0 2 2 1 2 2 0 2 0 2 2 1 2 1 2 0 2 1 3 0 2 2 0 3 0 1 1 2 1 3 0 3 1 1 1
s42   3 1 2 0 1 2 2 0 3 2 0 2 1 2 0 2 2 2 0 3 0 1 2 1 2 1 2 1 2 1 2 0 2 2 1 1 2 1 2 2 0
s7    2 1 1 1 2 2 0 2 2 1 2 1 1 2 1 1 2 1 2 1 1 3 0 1 1 3 1 1 1 3 1 0 1 2 2 1 2 1 1 2 1
s2026 2 0 2 2 0 2 2 1 2 1 1 2 0 3 2 0 2 2 0 2 2 1 2 0 2 1 1 2 2 1 2 0 2 2 0 3 0 1 3 2 0
```

Cúp mỗi tuần (tuần 1 trở đi):

- seed 1: 3 3 2 2 2 3 2 3 2 2 2 3, tuần 13 = 3, các tuần còn lại đến 100 đều 2.
- seed 42: 3 3 3 2 3 2 2 2 2 3 3 3, rồi toàn 2.
- seed 7: 3 3 3 2 2 2 2 3 2 3 2 2, rồi toàn 2.
- seed 2026: 3 3 3 2 2 2 2 2 2 3 3 3, rồi toàn 2.

Không tuần nào quá 3 mốc trong 4 seed; chưa có số liệu "tuần >3 mốc sau tuần 62" ngoài sim s3.

## Kiểm chứng cúp giống nhau

- Cúp b_steady2 tuần 1-60 giống v0.42.0 (fbd56a8): dựng bản cũ bằng `git archive` vào thư mục tạm, chạy 4 seed 1/42/7/2026, kết quả giống hệt, không phá sản. Thư mục tạm đã xóa.
- `sim:long:s2`, tuần 40-60 có mốc trên 21 tuần (tuần nhiều mốc nhất): s1 19 (2); s42 15 (3); s7 18 (3); s2026 15 (3).

## UI (T-121)

- Danh sách hơn 16 hàng: khách đã xong 4 mốc gom vào nhóm thu gọn "Đã xong sổ · N khách quen". Nhóm dùng lại class nút Thành tựu, không CSS mới, không modal.
- Hàng "Mới" và toast vẫn nằm trong danh sách chính.
- Test `tests/ui/t121-long-regulars-list.test.ts`: sổ 32 khách, 8 đang dở, 24 đã xong.
- `LAYOUT_OFFLINE=1` check-layout: PASS 157 kiểm tra, cả bản gốc và bản mới. Đây không tương đương layout thật.

## Test

- vitest lần review: 213 file, 2503 test qua.
- `npm run check` sau T-121: 214 file, 2506 test qua.
- `sim:long`: reviewer thứ nhất không đợi xong, chưa có kết quả cuối. Một reviewer khác ghi pass 28 test, exit 0 (báo cáo gián tiếp).

### Test flaky

`css-order` đôi khi rớt. Chạy lại một lần nếu rớt; ở các lần review đều qua ngay.

## Chưa kiểm chứng

- Layout thật ở độ rộng 390.
- Hiệu năng và draw call thật.
- Media.
- Số tuần >3 mốc sau tuần 62 ngoài sim s3 (sim s3 đo được không tuần nào >3).
- Danh sách khách sinh ra đầy đủ: chỉ suy ra tay ba dòng trong bảng trên từ mã, chưa chạy mẫu.

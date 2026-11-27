# Initial database state of the repository tests

This document lists the rows each repository test seeds into the database before every test case runs.
Columns follow `src/shared/database/schema.sql`.

Every repository test runs this in `beforeEach` before seeding:

```sql
TRUNCATE TABLE fines, loans, holds, physical_copies, books, users RESTART IDENTITY CASCADE;
```

So every test case starts from the tables below, and the `id` values are always the same.

## Conventions

| Notation | Meaning |
| :--- | :--- |
| `NULL` | The column is NULL (not given and has no default). |
| `now()` | Column default `CURRENT_TIMESTAMP`, i.e. the time the seed ran. |
| `CURRENT_DATE − n` / `CURRENT_DATE + n` | Date computed by the database when the seed runs. |
| `(CURRENT_DATE − n) 09:00` | `CURRENT_DATE − n` at 09:00 in the database session time zone. |
| `… 09:00 (DB tz)` | A literal date at 09:00 in the database session time zone. |
| `2026-10-14 09:00+00` | A literal timestamp in UTC. |
| `2 (STU002)` | A foreign key: the referenced `id`, with its readable code in brackets. |
| `Paperback`, `English`, `0`, `5` … | A column default from the schema, not a value passed by the seed. |

`view_book_stock` is not a table. It is derived from `physical_copies`, and is shown after each module's tables for convenience.

## Contents

1. [Holds module](#1-holds-module)
2. [Loans module](#5-loans-module)

---
## 1. Holds module

- Test: `src/modules/holds/repositories/holds.respository.test.ts`
- Seed: `seedHoldsData()` in the same file

### users

| id | account_id | full_name | password_hash | role | status | year_group | active_loans_count | max_loans_limit | created_at | updated_at |
| :-: | :--- | :--- | :--- | :--- | :--- | :--- | :-: | :-: | :--- | :--- |
| 1 | STU001 | Maya Chen | seed-password | student | Active | Year 10 | 1 | 5 | now() | now() |
| 2 | STU002 | Amira Khan | seed-password | student | Active | Year 10 | 1 | 5 | now() | now() |
| 3 | STU003 | Fines Student | seed-password | student | Active | Year 10 | 0 | 5 | now() | now() |
| 4 | STU004 | Fresh Student | seed-password | student | Active | Year 10 | 0 | 5 | now() | now() |
| 5 | STF001 | Library Staff | seed-password | staff | Active | NULL | 0 | 5 | now() | now() |

### books

| id | title | author | isbn | category | genre | keywords | publisher | published_year | language | format | page_count | description | cover_image_url | shelf_reference | created_at | updated_at |
| :-: | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | The Midnight Library | Matt Haig | 9781786892737 | Fiction | NULL | NULL | NULL | NULL | English | Paperback | NULL | NULL | NULL | FIC HAI · A3 | now() | now() |
| 2 | Wonder | R.J. Palacio | 9780375869020 | Fiction | NULL | NULL | NULL | NULL | English | Paperback | NULL | NULL | NULL | FIC PAL · A2 | now() | now() |
| 3 | A Brief History of Time | Stephen Hawking | 9780553380163 | Non-fiction | NULL | NULL | NULL | NULL | English | Paperback | NULL | NULL | NULL | SCI HAW · B2 | now() | now() |
| 4 | Persepolis | Marjane Satrapi | 9780375714832 | Graphic novels | NULL | NULL | NULL | NULL | English | Paperback | NULL | NULL | NULL | GRA SAT · C1 | now() | now() |
| 5 | Truyện Kiều | Nguyễn Du | 9786041000001 | Poetry | NULL | NULL | NULL | NULL | English | Paperback | NULL | NULL | NULL | NULL | now() | now() |

### physical_copies

| id | copy_code | book_id | home_location | state | condition | notes | created_at | updated_at |
| :-: | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | WB-00421 | 1 (Midnight Library) | FIC HAI · A3 | Available | Good | NULL | now() | now() |
| 2 | WB-00422 | 1 (Midnight Library) | FIC HAI · A3 | Available | Good | NULL | now() | now() |
| 3 | WB-00423 | 1 (Midnight Library) | FIC HAI · A3 | Reserved | Good | NULL | now() | now() |
| 4 | WB-00216 | 2 (Wonder) | FIC PAL · A2 | Borrowed | Good | NULL | now() | now() |
| 5 | WB-00217 | 2 (Wonder) | FIC PAL · A2 | Available | Good | NULL | now() | now() |
| 6 | WB-00218 | 2 (Wonder) | FIC PAL · A2 | Reserved | Good | NULL | now() | now() |
| 7 | WB-00632 | 3 (Brief History) | SCI HAW · B2 | Borrowed | Good | NULL | now() | now() |
| 8 | WB-00700 | 4 (Persepolis) | GRA SAT · C1 | Lost | Lost | NULL | now() | now() |

### holds

| id | hold_code | student_id | book_id | copy_id | status | requested_at | collect_by |
| :-: | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | HLD-0900 | 4 (STU004) | 1 (Midnight Library) | 1 (WB-00421) | Cancelled | 2026-10-20 09:00+00 | 2026-10-21 08:30+00 |
| 2 | HLD-0901 | 1 (STU001) | 3 (Brief History) | 7 (WB-00632) | Fulfilled | 2026-10-25 09:00+00 | 2026-10-26 08:30+00 |
| 3 | HLD-1001 | 1 (STU001) | 1 (Midnight Library) | 3 (WB-00423) | Ready | 2026:11- 01 09:00+00 | 2026-11-02 08:30+00 |
| 4 | HLD-1002 | 4 (STU004) | 2 (Wonder) | 6 (WB-00218) | Ready | 2026-11-03 09:00+00 | 2026-11-04 08:30+00 |

### loans

| id | borrow_code | student_id | copy_id | status | borrowed_at | due_date | returned_at | return_condition | renewal_count | created_at |
| :-: | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :-: | :--- |
| 1 | BR-1000 | 1 (STU001) | 5 (WB-00217) | Returned | 2026:10- 01 09:00+00 | 2026-10-15 | 2026-10-14 09:00+00 | Good | 0 | now() |
| 2 | BR-1001 | 2 (STU002) | 4 (WB-00216) | Active | (CURRENT_DATE − 17) 09:00 | CURRENT_DATE − 3 | NULL | NULL | 0 | now() |
| 3 | BR-1002 | 1 (STU001) | 7 (WB-00632) | Active | (CURRENT_DATE − 4) 09:00 | CURRENT_DATE + 10 | NULL | NULL | 0 | now() |

### fines

| id | loan_id | student_id | amount | reason | status | created_at | paid_at |
| :-: | :--- | :--- | --: | :--- | :--- | :--- | :--- |
| 1 | NULL | 3 (STU003) | 2.50 | Overdue | Unpaid | now() | NULL |
| 2 | NULL | 3 (STU003) | 1.25 | Damaged | Unpaid | now() | NULL |
| 3 | NULL | 3 (STU003) | 10.00 | Lost | Paid | now() | 2026-10-30 09:00+00 |

### view_book_stock (derived)

| book_id | title | total_copies | available_copies | borrowed_copies | reserved_copies | damaged_copies | lost_copies |
| :-: | :--- | :-: | :-: | :-: | :-: | :-: | :-: |
| 1 | The Midnight Library | 3 | 2 | 0 | 1 | 0 | 0 |
| 2 | Wonder | 3 | 1 | 1 | 1 | 0 | 0 |
| 3 | A Brief History of Time | 1 | 0 | 1 | 0 | 0 | 0 |
| 4 | Persepolis | 1 | 0 | 0 | 0 | 0 | 1 |
| 5 | Truyện Kiều | 0 | 0 | 0 | 0 | 0 | 0 |

**Summary:**

| Student | Active loans | Overdue loans | Unpaid fines | Ready holds |
| :--- | :-: | :-: | --: | :--- |
| STU001 Maya Chen | 1 (BR-1002) | 0 | 0.00 | HLD-1001 |
| STU002 Amira Khan | 1 (BR-1001) | 1 | 0.00 | none |
| STU003 Fines Student | 0 | 0 | 3.75 | none |
| STU004 Fresh Student | 0 | 0 | 0.00 | HLD-1002 |

---

## 2. Loans module

- Test: `src/modules/loans/repositories/loans.repository.test.ts`
- Seed: `seedLoansData()` in the same file

### users

| id | account_id | full_name | password_hash | role | status | year_group | active_loans_count | max_loans_limit | created_at | updated_at |
| :-: | :--- | :--- | :--- | :--- | :--- | :--- | :-: | :-: | :--- | :--- |
| 1 | STU001 | Maya Chen | seed-password | student | Active | Year 10 | 2 | 5 | now() | now() |
| 2 | STU002 | Amira Khan | seed-password | student | Active | Year 10 | 1 | 5 | now() | now() |
| 3 | STU003 | Fines Student | seed-password | student | Active | Year 10 | 0 | 5 | now() | now() |
| 4 | STU004 | Inactive Student | seed-password | student | Inactive | Year 10 | 0 | 5 | now() | now() |
| 5 | STU005 | Fresh Student | seed-password | student | Active | Year 10 | 0 | 5 | now() | now() |
| 6 | STF001 | Library Staff | seed-password | staff | Active | NULL | 0 | 5 | now() | now() |

### books

| id | title | author | isbn | category | genre | keywords | publisher | published_year | language | format | page_count | description | cover_image_url | shelf_reference | created_at | updated_at |
| :-: | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | The Midnight Library | Matt Haig | 9781786892737 | Fiction | NULL | NULL | NULL | NULL | English | Paperback | NULL | NULL | NULL | NULL | now() | now() |
| 2 | Wonder | R.J. Palacio | 9780375869020 | Fiction | NULL | NULL | NULL | NULL | English | Paperback | NULL | NULL | NULL | NULL | now() | now() |
| 3 | A Brief History of Time | Stephen Hawking | 9780553380163 | Non-fiction | NULL | NULL | NULL | NULL | English | Paperback | NULL | NULL | NULL | NULL | now() | now() |
| 4 | Persepolis | Marjane Satrapi | 9780375714832 | Graphic novels | NULL | NULL | NULL | NULL | English | Paperback | NULL | NULL | NULL | NULL | now() | now() |
| 5 | Oxford English Dictionary | Oxford University Press | 9780199640942 | Reference | NULL | NULL | NULL | NULL | English | Paperback | NULL | NULL | NULL | NULL | now() | now() |

### physical_copies

| id | copy_code | book_id | home_location | state | condition | notes | created_at | updated_at |
| :-: | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | WB-00421 | 1 (Midnight Library) | FIC HAI · A3 | Available | Good | NULL | now() | now() |
| 2 | WB-00422 | 1 (Midnight Library) | FIC HAI · A3 | Borrowed | Good | NULL | now() | now() |
| 3 | WB-00423 | 1 (Midnight Library) | FIC HAI · A3 | Reserved | Good | NULL | now() | now() |
| 4 | WB-00424 | 1 (Midnight Library) | FIC HAI · A3 | Damaged | Damaged | NULL | now() | now() |
| 5 | WB-00216 | 2 (Wonder) | FIC PAL · A2 | Borrowed | Good | NULL | now() | now() |
| 6 | WB-00217 | 2 (Wonder) | FIC PAL · A2 | Available | Good | NULL | now() | now() |
| 7 | WB-00218 | 2 (Wonder) | FIC PAL · A2 | Reserved | Good | NULL | now() | now() |
| 8 | WB-00632 | 3 (Brief History) | SCI HAW · B2 | Borrowed | Good | NULL | now() | now() |
| 9 | WB-00700 | 4 (Persepolis) | GRA SAT · C1 | Lost | Lost | NULL | now() | now() |
| 10 | WB-00800 | 5 (Dictionary) | REF OXF · D1 | Available | Good | NULL | now() | now() |
| 11 | WB-00801 | 5 (Dictionary) | REF OXF · D1 | Reserved | Good | NULL | now() | now() |

### holds

| id | hold_code | student_id | book_id | copy_id | status | requested_at | collect_by |
| :-: | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | HLD-0900 | 1 (STU001) | 5 (Dictionary) | 10 (WB-00800) | Cancelled | 2026-10-21 09:00+00 | 2026-10-22 08:30+00 |
| 2 | HLD-0901 | 1 (STU001) | 3 (Brief History) | 8 (WB-00632) | Fulfilled | 2026-10-25 09:00+00 | 2026-10-26 08:30+00 |
| 3 | HLD-1001 | 1 (STU001) | 1 (Midnight Library) | 3 (WB-00423) | Ready | 2026:11- 01 09:00+00 | 2026-11-02 08:30+00 |
| 4 | HLD-1002 | 5 (STU005) | 2 (Wonder) | 7 (WB-00218) | Ready | 2026-11-03 09:00+00 | 2026-11-04 08:30+00 |
| 5 | HLD-1003 | 1 (STU001) | 5 (Dictionary) | 11 (WB-00801) | Ready | 2026-11-05 09:00+00 | 2026-11-06 08:30+00 |

### loans

| id | borrow_code | student_id | copy_id | status | borrowed_at | due_date | returned_at | return_condition | renewal_count | created_at |
| :-: | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :-: | :--- |
| 1 | BR-1000 | 1 (STU001) | 1 (WB-00421) | Returned | 2026:10- 01 09:00 (DB tz) | 2026-10-15 | 2026-10-14 10:00+00 | Good | 0 | now() |
| 2 | BR-1001 | 2 (STU002) | 2 (WB-00422) | Active | (CURRENT_DATE − 16) 09:00 | CURRENT_DATE − 2 | NULL | NULL | 0 | now() |
| 3 | BR-1002 | 1 (STU001) | 8 (WB-00632) | Active | (CURRENT_DATE − 30) 09:00 | CURRENT_DATE + 10 | NULL | NULL | 1 | now() |
| 4 | BR-1004 | 1 (STU001) | 5 (WB-00216) | Active | (CURRENT_DATE − 13) 09:00 | CURRENT_DATE + 1 | NULL | NULL | 0 | now() |
| 5 | BR-1005 | 1 (STU001) | 10 (WB-00800) | Returned | 2026:10- 05 09:00 (DB tz) | 2026-10-19 | 2026-10-20 10:00+00 | Good | 0 | now() |

There is no `BR-1003` in this seed.

### fines

| id | loan_id | student_id | amount | reason | status | created_at | paid_at |
| :-: | :--- | :--- | --: | :--- | :--- | :--- | :--- |
| 1 | NULL | 3 (STU003) | 2.50 | Overdue | Unpaid | now() | NULL |
| 2 | NULL | 3 (STU003) | 1.25 | Damaged | Unpaid | now() | NULL |
| 3 | NULL | 3 (STU003) | 10.00 | Lost | Paid | now() | 2026-10-30 09:00+00 |

### view_book_stock (derived)

| book_id | title | total_copies | available_copies | borrowed_copies | reserved_copies | damaged_copies | lost_copies |
| :-: | :--- | :-: | :-: | :-: | :-: | :-: | :-: |
| 1 | The Midnight Library | 4 | 1 | 1 | 1 | 1 | 0 |
| 2 | Wonder | 3 | 1 | 1 | 1 | 0 | 0 |
| 3 | A Brief History of Time | 1 | 0 | 1 | 0 | 0 | 0 |
| 4 | Persepolis | 1 | 0 | 0 | 0 | 0 | 1 |
| 5 | Oxford English Dictionary | 2 | 1 | 0 | 1 | 0 | 0 |

**Summary:**

| Student | Active loans | Overdue loans | Unpaid fines | Ready holds | Returned loans |
| :--- | :-: | :-: | --: | :--- | :--- |
| STU001 Maya Chen | 2 (BR-1004 due tomorrow, BR-1002 renewed once) | 0 | 0.00 | HLD-1003, HLD-1001 | BR-1005, BR-1000 |
| STU002 Amira Khan | 1 (BR-1001) | 1 | 0.00 | none | none |
| STU003 Fines Student | 0 | 0 | 3.75 | none | none |
| STU004 Inactive Student (Inactive) | 0 | 0 | 0.00 | none | none |
| STU005 Fresh Student | 0 | 0 | 0.00 | HLD-1002 | none |

`getLoanRecords` status buckets of the active loans (window "due soon" = today … today + 2):

| Bucket | Loans |
| :--- | :--- |
| overdue (`due_date < CURRENT_DATE`) | BR-1001 |
| due_soon | BR-1004 |
| on_loan | BR-1002 |

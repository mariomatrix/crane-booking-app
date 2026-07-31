# Bolt's Journal - Marina Crane Booking App

Performance-obsessed assistance journal tracking critical performance opportunities and architectural insights.

## 2026-03-01 - Optimizing Reservation Listing for Users
**Learning:** Standard user reservation listing (`reservation.myReservations`) fetching crane info and unread counts individually causes N+1 queries. We can resolve this beautifully using left joins and a conditional subquery based on the user's role.
**Action:** Replace the map with a single SQL query leveraging Left Joins and a Subquery for message counts in `server/routers.ts`.

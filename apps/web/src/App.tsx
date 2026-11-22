import { Navigate, Route, Routes } from "react-router";
import Layout from "./Layout.tsx";
import AdminLayout from "./pages/admin/AdminLayout.tsx";
import BookingsPage from "./pages/admin/BookingsPage.tsx";
import EventTypesPage from "./pages/admin/EventTypesPage.tsx";
import NewEventTypePage from "./pages/admin/NewEventTypePage.tsx";
import BookPage from "./pages/BookPage.tsx";
import EventTypePage from "./pages/EventTypePage.tsx";
import HomePage from "./pages/HomePage.tsx";
import NotFoundPage from "./pages/NotFoundPage.tsx";

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<HomePage />} />
        <Route path="book" element={<BookPage />} />
        <Route path="book/:slug" element={<EventTypePage />} />
        <Route path="admin" element={<AdminLayout />}>
          <Route index element={<Navigate to="/admin/event-types" replace />} />
          <Route path="event-types" element={<EventTypesPage />} />
          <Route path="event-types/new" element={<NewEventTypePage />} />
          <Route path="bookings" element={<BookingsPage />} />
        </Route>
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}

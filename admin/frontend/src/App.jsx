import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { CurrentOrderProvider } from './contexts/CurrentOrderContext';
import Login from './pages/Login';
import MainLayout from './layouts/MainLayout';
import Home from './pages/Home';
import SelectOrder from './pages/orders/SelectOrder';
import NewOrder from './pages/orders/NewOrder';
import OrderDetail from './pages/orders/OrderDetail';
import ImportTextbook from './pages/orders/ImportTextbook';
import ClassManage from './pages/orders/ClassManage';
import ClassDetail from './pages/orders/ClassDetail';
import TextbookManage from './pages/orders/TextbookManage';
import TextbookDetail from './pages/orders/TextbookDetail';
import ImportRoster from './pages/orders/ImportRoster';

function isTokenValid(token) {
  if (!token) return false;
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.exp * 1000 > Date.now();
  } catch {
    return false;
  }
}

function RequireAuth({ children }) {
  const token = localStorage.getItem('token');
  if (!isTokenValid(token)) {
    localStorage.removeItem('token');
    return <Navigate to="/login" replace />;
  }
  return children;
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/"
          element={
            <RequireAuth>
              <CurrentOrderProvider>
                <MainLayout />
              </CurrentOrderProvider>
            </RequireAuth>
          }
        >
          <Route index element={<Home />} />
          <Route path="orders/select" element={<SelectOrder />} />
          <Route path="orders/new" element={<NewOrder />} />
          <Route path="orders/detail" element={<OrderDetail />} />
          <Route path="orders/import-textbook" element={<ImportTextbook />} />
          <Route path="orders/classes" element={<ClassManage />} />
          <Route path="orders/class-detail/:classId" element={<ClassDetail />} />
          <Route path="orders/textbooks" element={<TextbookManage />} />
          <Route path="orders/textbook-detail/:textbookId" element={<TextbookDetail />} />
          <Route path="orders/import-roster" element={<ImportRoster />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;

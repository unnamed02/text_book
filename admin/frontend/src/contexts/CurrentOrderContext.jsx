import { createContext, useContext, useState, useCallback } from 'react';

const CurrentOrderContext = createContext(null);

const STORAGE_KEY = 'current_order';

function readStoredOrder() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function CurrentOrderProvider({ children }) {
  const [currentOrder, setOrder] = useState(readStoredOrder);

  const setCurrentOrder = useCallback((order) => {
    setOrder(order);
    if (order) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(order));
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  const clearCurrentOrder = useCallback(() => {
    setOrder(null);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  return (
    <CurrentOrderContext.Provider value={{ currentOrder, setCurrentOrder, clearCurrentOrder }}>
      {children}
    </CurrentOrderContext.Provider>
  );
}

export function useCurrentOrder() {
  const ctx = useContext(CurrentOrderContext);
  if (!ctx) {
    throw new Error('useCurrentOrder must be used within CurrentOrderProvider');
  }
  return ctx;
}

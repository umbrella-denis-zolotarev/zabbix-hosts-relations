import { Navigate, Route, Routes } from "react-router-dom";
import HostList from "./pages/HostList";
import HostDetail from "./pages/HostDetail";

function App() {
  return (
    <Routes>
      <Route path="/" element={<HostList />} />
      <Route path="/hosts/:hostid" element={<HostDetail />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;

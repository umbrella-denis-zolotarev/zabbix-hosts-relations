import { Navigate, Route, Routes } from "react-router-dom";
import HostList from "./pages/HostList";
import RelationsMapPage from "./pages/RelationsMapPage";

function App() {
  return (
    <Routes>
      {/* Both routes render the list; /hosts/:hostid also opens the detail
          modal for that host, so deep links keep working. */}
      <Route path="/" element={<HostList />} />
      <Route path="/hosts/:hostid" element={<HostList />} />
      <Route path="/map" element={<RelationsMapPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;

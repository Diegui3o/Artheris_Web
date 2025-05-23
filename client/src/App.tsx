import React from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { CssBaseline, Box, Toolbar } from "@mui/material";
import Sidebar from "./page/Sidebar";
import Home from "./page/Home";
import Dron3D from "./page/Dron3D";
import Graphics from "./page/graphics";
import Settings from "./page/Settings";
import Profile from "./page/Profile";
import Calibration from "./page/Calibration";
import MotorSimulation from "./page/MotorSimulation";
import Simulator from "./page/Simulator";

const App: React.FC = () => {
  return (
    <Router>
      <Box sx={{ display: "flex" }}>
        <CssBaseline />
        <Sidebar />
        <Box
          component="main"
          sx={{
            flexGrow: 1,
            p: 3,
            backgroundColor: "#1f2937",
            color: "#fff",
            height: "100vh",
            overflow: "auto",
          }}
        >
          <Toolbar />
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/dron" element={<Dron3D />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/graphics" element={<Graphics />} />
            <Route path="/calibration" element={<Calibration />} />
            <Route path="/motor-simulation" element={<MotorSimulation />} />
            <Route path="/simulation" element={<Simulator />} />
          </Routes>
        </Box>
      </Box>
    </Router>
  );
};

export default App;

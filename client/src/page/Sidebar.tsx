import { useState } from "react";
import { NavLink } from "react-router-dom";
import {
  Menu,
  Home,
  Airplay,
  Sliders,
  User,
  Settings,
  Search,
  Wrench,
  AirVent,
  Cpu,
} from "lucide-react";
import {
  Drawer,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Divider,
  IconButton,
  Toolbar,
} from "@mui/material";

export default function Layout() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="h-screen flex flex-col">
      {/* Barra superior */}
      <header className="bg-gray-900 text-white flex items-center justify-between px-4 py-3 shadow-md fixed top-0 left-0 w-full z-10">
        {/* Contenedor del logo y botón de menú */}
        <div
          className="flex items-center transition-all"
          style={{ marginLeft: isOpen ? 240 : 80 }}
        >
          <IconButton onClick={() => setIsOpen(!isOpen)} className="text-white">
            <Menu size={24} />
          </IconButton>
          {isOpen && (
            <img
              src="https://img.icons8.com/ultraviolet/40/drone.png"
              alt="drone"
              className="ml-2 transition-all"
            />
          )}
          {!isOpen && (
            <img
              src="https://img.icons8.com/ultraviolet/40/drone.png"
              alt="drone"
              className="ml-2 transition-all"
              style={{ marginLeft: "8px" }} // Ajusta la posición del logo cuando el menú está colapsado
            />
          )}
        </div>

        {/* Barra de búsqueda */}
        <div className="flex items-center bg-gray-800 rounded-lg px-4 py-2 w-1/3">
          <Search size={20} className="text-gray-400" />
          <input
            type="text"
            placeholder="Buscar..."
            className="bg-transparent text-white outline-none ml-2 w-full placeholder-gray-400"
          />
        </div>

        {/* Botón de iniciar sesión */}
        <button className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition">
          Iniciar Sesión
        </button>
      </header>

      {/* Contenedor principal */}
      <div className="flex flex-1 mt-[60px]">
        {/* Sidebar */}
        <Drawer
          variant="permanent"
          open={isOpen}
          sx={{
            width: isOpen ? 240 : 80,
            flexShrink: 0,
            "& .MuiDrawer-paper": {
              width: isOpen ? 240 : 80,
              transition: "width 0.3s ease-in-out",
              boxSizing: "border-box",
              backgroundColor: "#1f2937",
              color: "#fff",
            },
          }}
        >
          <Toolbar />
          <Divider />
          <List>
            {[
              { to: "/", icon: <Home size={24} />, text: "Inicio" },
              {
                to: "/calibration",
                icon: <Wrench size={24} />,
                text: "Calibration",
              },
              { to: "/dron", icon: <Airplay size={24} />, text: "Dron 3D" },
              {
                to: "/graphics",
                icon: <Sliders size={24} />,
                text: "Gráficos",
              },
              {
                to: "/motor-simulation",
                icon: <AirVent size={24} />,
                text: "Motors",
              },
              {
                to: "/simulation",
                icon: <Cpu size={24} />,
                text: "Simulación",
              },
              {
                to: "/settings",
                icon: <Settings size={24} />,
                text: "Ajustes",
              },
              { to: "/profile", icon: <User size={24} />, text: "Perfil" },
            ].map((item, index) => (
              <ListItem
                component={NavLink}
                to={item.to}
                key={index}
                sx={{ color: "inherit", textDecoration: "none" }}
              >
                <ListItemIcon sx={{ color: "white" }}>{item.icon}</ListItemIcon>
                {isOpen && <ListItemText primary={item.text} />}
              </ListItem>
            ))}
          </List>
        </Drawer>
      </div>
    </div>
  );
}

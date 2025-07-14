import { useState } from "react";
import {
  Search,
  Menu,
  Home,
  Airplay,
  Sliders,
  Wrench,
  AirVent,
  Cpu,
  Settings,
  User,
  Camera,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import {
  Drawer,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Divider,
  IconButton,
  Toolbar,
  TextField,
  InputAdornment,
  Box,
} from "@mui/material";
import { routes } from "../routes";

export default function Layout() {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [showNoResults, setShowNoResults] = useState(false);
  const navigate = useNavigate();

  // Filter routes based on the search term
  const handleSearch = (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    setSearchTerm(value);

    if (value.trim() === "") {
      setShowNoResults(false);
      return;
    }

    const filteredRoutes = routes.filter(
      (route) =>
        route.name.toLowerCase().includes(value.toLowerCase()) ||
        route.description.toLowerCase().includes(value.toLowerCase())
    );

    setShowNoResults(filteredRoutes.length === 0);
  };

  return (
    <div className="h-screen flex flex-col">
      {/* Upper bar */}
      <header className="bg-gray-900 text-white flex items-center justify-between px-4 py-3 shadow-md fixed top-0 left-0 w-full z-10">
        {/* Logo container and menu button */}
        <div
          className="flex items-center transition-all"
          style={{ marginLeft: isOpen ? 240 : 80 }}
        >
          <IconButton onClick={() => setIsOpen(!isOpen)} className="text-white">
            <Menu size={24} color="#fff" />
          </IconButton>
          <img
            src="https://img.icons8.com/ultraviolet/40/drone.png"
            alt="drone"
            className="ml-2 transition-all"
          />
          <span className="ml-2 text-white font-bold text-lg select-none">
            Artheris FlightControl
          </span>
        </div>

        {/* Search bar */}
        <TextField
          fullWidth={false}
          placeholder="Buscar..."
          variant="outlined"
          size="small"
          value={searchTerm}
          onChange={handleSearch}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <Search size={16} />
              </InputAdornment>
            ),
          }}
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          sx={{
            bgcolor: "rgba(255, 255, 255, 0.1)",
            borderRadius: 1,
            width: "200px",
            height: "32px",
            mb: 2,
            transition: "all 0.3s ease",
            "& .MuiOutlinedInput-root": {
              "& fieldset": {
                borderColor: "rgba(255, 255, 255, 0.2)",
              },
              "&:hover fieldset": {
                borderColor: "#f3f4f6",
                transform: "scale(1.02)",
              },
              "&.Mui-focused fieldset": {
                borderColor: "#f3f4f6",
                transform: "scale(1.02)",
              },
            },
            "& .MuiInputBase-input": {
              color: "#f3f4f6",
              fontSize: "0.875rem",
              padding: "8px 12px",
            },
          }}
        />
      </header>

      {/* Main container */}
      <div className="flex flex-1 mt-[60px]">
        <Drawer
          variant="permanent"
          open={isOpen}
          sx={{
            width: isOpen ? 240 : 80,
            flexShrink: 0,
            "& .MuiDrawer-paper": {
              width: isOpen ? 240 : 80,
              boxSizing: "border-box",
              backgroundColor: "#1f2937",
              color: "#fff",
            },
          }}
        >
          <Toolbar />
          <Divider />
          <List>
            {showNoResults ? (
              <Box
                sx={{
                  p: 2,
                  textAlign: "center",
                  color: "#a1a1aa",
                  bgcolor: "rgba(255, 255, 255, 0.05)",
                  borderRadius: 1,
                  mb: 2,
                }}
              >
                No se encontraron resultados
              </Box>
            ) : (
              routes.map((route) => (
                <ListItem
                  key={route.path}
                  component="div"
                  onClick={() => {
                    navigate(route.path);
                    if (window.innerWidth < 768) {
                      setIsOpen(false);
                    }
                  }}
                  sx={{
                    mb: 1,
                    borderRadius: 1,
                    transition: "all 0.2s ease",
                    "&:hover": {
                      backgroundColor: "#374151",
                      transform: "translateX(5px)",
                    },
                    "& .MuiListItemIcon-root": {
                      minWidth: "auto",
                      color: "#a1a1aa",
                    },
                  }}
                >
                  <ListItemIcon>
                    {route.icon === "Home" && <Home size={20} />}
                    {route.icon === "Airplay" && <Airplay size={20} />}
                    {route.icon === "Sliders" && <Sliders size={20} />}
                    {route.icon === "Wrench" && <Wrench size={20} />}
                    {route.icon === "AirVent" && <AirVent size={20} />}
                    {route.icon === "Cpu" && <Cpu size={20} />}
                    {route.icon === "Settings" && <Settings size={20} />}
                    {route.icon === "User" && <User size={20} />}
                    {route.icon === "Camera" && <Camera size={20} />}
                  </ListItemIcon>
                  <ListItemText
                    primary={route.name}
                    sx={{
                      marginLeft: 2,
                      display: isOpen ? "block" : "none",
                      "& .MuiListItemText-primary": {
                        color: "#f3f4f6",
                        fontWeight: 500,
                        fontSize: "0.875rem",
                      },
                    }}
                  />
                </ListItem>
              ))
            )}
          </List>
        </Drawer>
      </div>
    </div>
  );
}

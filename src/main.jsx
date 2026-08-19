import React from "react";
import { createRoot } from "react-dom/client";
import SubredditVibeCheck from "./SubredditVibeCheck.jsx";
import "./styles.css";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <SubredditVibeCheck />
  </React.StrictMode>
);

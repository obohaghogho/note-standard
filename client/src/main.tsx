import React from "react";
import ReactDOM from "react-dom/client";

function Test() {
  return <h1 style={{color: "red", padding: "50px", textAlign: "center"}}>REACT IS WORKING</h1>;
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Test />
  </React.StrictMode>
);

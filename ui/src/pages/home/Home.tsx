import axios from "axios";
import { useEffect } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import GlobalChat from "../../components/GlobalChat";

const Home = () => {
  const serverUrl: string = import.meta.env.VITE_SERVER_URL;
  const navigate = useNavigate();

  useEffect(() => {
    axios({
      withCredentials: true,
      url: `${serverUrl}/home`,
      method: "GET",
    })
      .catch(() => {
        navigate("/"); // only redirect if not authenticated
      });
  }, [serverUrl, navigate]);

  return (
    <div>
      {/* GLOBAL_CHAT_V1 — stays mounted across Home tabs and on-demand play.
          Live www deploy is a splice onto the patched bundle, never a full ui/dist overwrite.
          Stamp: STAMP-www-global-chat */}
      <Outlet />
      <GlobalChat dock="above-footer" />
    </div>
  );
};

export default Home;
















// import axios from "axios";
// import { useEffect } from "react";
// import { Outlet, useNavigate } from "react-router-dom";

// const Home = () => {
//   const serverUrl: string = import.meta.env.VITE_SERVER_URL;
//   const navigate = useNavigate();

//   useEffect(() => {
//     axios({
//       withCredentials: true,
//       url: `${serverUrl}/home`,
//       method: "GET",
//     })
//       .then(() => {
//         navigate("/home");
//       })
//       .catch(() => {
//         navigate("/");
//       });
//   }, []);

//   return (
//     <div>
//       <Outlet />
//     </div>
//   );
// };

// export default Home;

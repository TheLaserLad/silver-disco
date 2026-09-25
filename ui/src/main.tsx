import ReactDOM from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import "./index.css";
import Root from "./pages/Root";
import LoginDemo from "./pages/login/Logincopy";
import Login from "./pages/login/Login";
import SignUp from "./pages/signUp/SignUp";
import Home from "./pages/home/Home";
import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import ErrorPage from "./ErrorPage";
import View from "./pages/home/sections/View";
import Dashboard from "./pages/dashboard/Dashboard";
import DashboardView from "./pages/dashboard/sections/DashboardView";
import AddressForm from "./pages/addressForm/AddressForm";
import SignUpDemo from "./pages/signUp/SignUpcopy"; // Demo signup
import TermsOfService from "./pages/terms/TermsOfService";
import PrivacyPolicy from "./pages/privacy/PrivacyPolicy";
import Leaderboard from "./pages/leaderboard/Leaderboard";
import Viewleaderboard from "./pages/leaderboard/sections/View";
import InviteLanding from "./pages/growth/InviteLanding";
import ChallengeLanding from "./pages/growth/ChallengeLanding";

const router = createBrowserRouter([
  {
    path: "/abc",
    element: <Root />,
    errorElement: <ErrorPage />,
  },
  {
    path: "/",
    element: <Login/>,
    errorElement: <ErrorPage />,
  },
  // {
  //   path: "/test",
  //   element: <Login/>,
  //   errorElement: <ErrorPage />,
  // },
  {
    path: "/login",
    element: <LoginDemo />,
    errorElement: <ErrorPage />,
  },
  {
    path: "/signUp",
    element: <SignUp />,
    errorElement: <ErrorPage />,
  },
  {
    path: "/admin_signUp",
    element: <SignUpDemo />,
    errorElement: <ErrorPage />,
  },
  {
    path: "/terms-of-service",
    element: <TermsOfService />,
    errorElement: <ErrorPage />,
  },
  {
    path: "/privacy-policy",
    element: <PrivacyPolicy />,
    errorElement: <ErrorPage />,
  },
  
  {
    path: "/home",
    element: <Home />,
    errorElement: <ErrorPage />,
    children: [
      {
        path: "/home",
        element: <View />,
      },
    ],
  },
  // {
  //   path: "/leaderboard",
  //   element: <Leaderboard />,
  //   errorElement: <ErrorPage />,
  //   children: [
  //     {
  //       index: true,
  //       element: <Viewleaderboard />,
  //     },
  //   ],
  // },
  {
  path: "/leaderboard",
  element: <Leaderboard />,
  errorElement: <ErrorPage />,
  children: [
    {
      index: true,
      element: <Viewleaderboard />, // default global leaderboard
    },
    {
      path: ":raceId",             // 👈 dynamic page
      element: <Viewleaderboard />, // reuse Viewleaderboard for race-specific
    },
  ],
},

  {
    path: "/dashboard",
    element: <Dashboard />,
    errorElement: <ErrorPage />,
    children: [
      {
        path: "/dashboard",
        element: <DashboardView />,
      },
    ],
  },
  {
    path: "/r/:code",
    element: <InviteLanding />,
    errorElement: <ErrorPage />,
  },
  {
    path: "/c/:id",
    element: <ChallengeLanding />,
    errorElement: <ErrorPage />,
  },
  {
    path: "/enter_address",
    element: <AddressForm />,
    errorElement: <ErrorPage />,
  },
]);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <>
    <RouterProvider router={router} />
    <ToastContainer
      position="top-center"
      autoClose={3000}
      theme="dark"
      newestOnTop
      closeOnClick
      pauseOnFocusLoss={false}
    />
  </>
);





















// import ReactDOM from "react-dom/client";
// import { createBrowserRouter, RouterProvider } from "react-router-dom";
// import "./index.css";
// import Root from "./pages/Root";
// import LoginDemo from "./pages/login/Logincopy";
// import Login from "./pages/login/Login";
// import SignUp from "./pages/signUp/SignUp";
// import Home from "./pages/home/Home";
// import "react-toastify/dist/ReactToastify.css";
// import ErrorPage from "./ErrorPage";
// import View from "./pages/home/sections/View";
// import Dashboard from "./pages/dashboard/Dashboard";
// import DashboardView from "./pages/dashboard/sections/DashboardView";
// import AddressForm from "./pages/addressForm/AddressForm";

// const router = createBrowserRouter([
//   {
//     path: "/",
//     element: <Root />,
//     errorElement: <ErrorPage />,
//   },
//   {
//     path: "/login",
//     element: <Login />,
//     errorElement: <ErrorPage />,
//   },
//   {
//     path: "/admin_login",
//     element: <LoginDemo />,
//     errorElement: <ErrorPage />,
//   },
//   {
//     path: "/signUp",
//     element: <SignUp />,
//     errorElement: <ErrorPage />,
//   },
//   {
//     path: "/home",
//     element: <Home />,
//     errorElement: <ErrorPage />,
//     children: [
//       {
//         path: "/home",
//         element: <View />,
//       },
//     ],
//   },
//   {
//     path: "/dashboard",
//     element: <Dashboard />,
//     errorElement: <ErrorPage />,
//     children: [
//       {
//         path: "/dashboard",
//         element: <DashboardView />,
//       },
//     ],
//   },
//   {
//     path: "/enter_address",
//     element: <AddressForm />,
//     errorElement: <ErrorPage />,
//   },
// ]);

// ReactDOM.createRoot(document.getElementById("root")!).render(
//   <RouterProvider router={router} />
// );

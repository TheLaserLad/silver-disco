import { useEffect, useState } from "react";
import { jsx, jsxs } from "react/jsx-runtime";
import { Link, useParams } from "react-router-dom";
import { createChallengeLanding } from "../../helpers/growth/challengeInbox.js";

const ChallengeLanding = createChallengeLanding({
  useState,
  useEffect,
  useParams,
  jsx,
  jsxs,
  Link,
  apiBase: import.meta.env.VITE_SERVER_URL || "https://pinballrace.com:8080",
});

export default ChallengeLanding;

import { useEffect } from "react";
import { useLocation, useNavigationType } from "react-router-dom";
import NProgress from "nprogress";
import "nprogress/nprogress.css";

NProgress.configure({ showSpinner: false, trickleSpeed: 100 });

export default function TopLoader() {
  const location = useLocation();
  const navType = useNavigationType();

  useEffect(() => {
    NProgress.start();
    const timer = setTimeout(() => NProgress.done(), 300);
    return () => clearTimeout(timer);
  }, [location.pathname, navType]);

  return null;
}
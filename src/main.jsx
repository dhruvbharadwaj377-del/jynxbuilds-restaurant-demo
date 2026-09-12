import { StrictMode, useEffect } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.jsx";

function MotionController() {
  useEffect(() => {
    const revealElements = document.querySelectorAll(
      ".story, .dishes, .gallery, .gallery-chef, .reservation, .footer"
    );

    const imageElements = document.querySelectorAll(
      ".story-image, .dish, .gallery-item, .chef-image"
    );

    const revealObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("section-visible");
            revealObserver.unobserve(entry.target);
          }
        });
      },
      {
        threshold: 0.12,
      }
    );

    revealElements.forEach((element) => {
      element.classList.add("section-reveal");
      revealObserver.observe(element);
    });

    imageElements.forEach((element) => {
      element.classList.add("image-reveal");
      revealObserver.observe(element);
    });

    return () => {
      revealObserver.disconnect();
    };
  }, []);

  return null;
}

function Root() {
  return (
    <>
      <App />
      <MotionController />
    </>
  );
}

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <Root />
  </StrictMode>
);
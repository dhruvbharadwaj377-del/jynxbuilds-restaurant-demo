import Navbar from "./components/Navbar";
import NoirExperience from "./experience/NoirExperience";
import Story from "./components/Story";
import SignatureDishes from "./components/SignatureDishes";
import Gallery from "./components/Gallery";
import Reservation from "./components/Reservation";
import Footer from "./components/Footer";

function App() {
  return (
    <>
      <Navbar />
      <main>
        <NoirExperience />
        <Story />
        <SignatureDishes />
        <Gallery />
        <Reservation />
      </main>
      <Footer />
    </>
  );
}

export default App;

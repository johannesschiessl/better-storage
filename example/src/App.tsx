import { useState } from "react";
import "./App.css";
import { useUpload } from "@example/sample-component/react";

function App() {
  const { upload } = useUpload(import.meta.env.VITE_CONVEX_SITE_URL!, "images");
  const [file, setFile] = useState<File | null>(null);
  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setFile(event.target.files?.[0] || null);
  };
  return (
    <>
      <h1>Better Storage Example App</h1>
      <div className="card">
        <input type="file" onChange={handleFileChange} />
        <button onClick={() => file && upload([file])}>Upload</button>
      </div>
    </>
  );
}

export default App;

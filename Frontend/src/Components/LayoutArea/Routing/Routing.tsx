import { Navigate, Route, Routes } from "react-router-dom";
import { List } from "../../DataArea/List/List";
import { New } from "../../DataArea/New/New";
import { Home } from "../../PagesArea/Home/Home";
import { Page404 } from "../Page404/Page404";
import "./Routing.css";

export function Routing() {

    return (
        <div className="Routing">
            <Routes>
                <Route path="/" element={<Navigate to="/home" />} />

                <Route path="/home" element={<Home />} />

                <Route path="/list" element={<List />} />
                
                <Route path="/new" element={<New />} />

                <Route path="*" element={<Page404 />} />
            </Routes>
        </div>
    );
}

import { NavLink } from "react-router-dom";
import "./Menu.css";

export function Menu() {

    return (
        <div className="Menu">

            <NavLink to="/home">Home</NavLink>

            <span> | </span>

            <NavLink to="/list">List</NavLink>

            <span> | </span>
            
            <NavLink to="/new">New</NavLink>

        </div>
    );
}

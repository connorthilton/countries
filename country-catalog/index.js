const express = require("express");
const path = require("path");
const session = require("express-session");
const knex = require("./db");

const app = express();
const port = process.env.PORT || 3000;

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.use(express.static(path.join(__dirname, "public")));
app.use(express.urlencoded({ extended: true }));

app.use(session({
    secret: process.env.SESSION_SECRET || "country_catalog_secret",
    resave: false,
    saveUninitialized: false,
    cookie: {
        maxAge: 1000 * 60 * 60,
        httpOnly: true,
        sameSite: "lax"
    }
}));

function requireLogin(req, res, next) {
    if (req.session.loggedIn) {
        next();
    } else {
        res.redirect("/");
    }
}

function validateCountry(body) {
    const errors = [];

    const country_name = String(body.country_name ?? "").trim();
    const popular_site = String(body.popular_site ?? "").trim();
    const capital = String(body.capital ?? "").trim();
    const populationText = String(body.population ?? "").trim();
    const visitedText = String(body.visited ?? "").trim().toUpperCase();

    if (country_name === "") {
        errors.push("Country name is required.");
    } else if (country_name.length > 30) {
        errors.push("Country name must be 30 characters or fewer.");
    }

    if (popular_site === "") {
        errors.push("Popular site is required.");
    } else if (popular_site.length > 50) {
        errors.push("Popular site must be 50 characters or fewer.");
    }

    if (capital === "") {
        errors.push("Capital is required.");
    } else if (capital.length > 30) {
        errors.push("Capital must be 30 characters or fewer.");
    }

    let population = null;
    if (!/^\d+$/.test(populationText)) {
        errors.push("Population must be a whole number 0 or greater.");
    } else {
        population = Number(populationText);
        if (population > 2147483647) {
            errors.push("Population is too large (max 2,147,483,647).");
        }
    }

    let visited = null;
    if (visitedText === "Y" || visitedText === "N") {
        visited = visitedText;
    } else if (visitedText !== "") {
        errors.push("Visited must be Y, N, or left blank.");
    }

    return {
        data: { country_name, popular_site, capital, population, visited },
        errors: errors
    };
}

function parseId(text) {
    if (!/^\d+$/.test(text)) {
        return null;
    }
    const id = Number(text);
    if (id < 1 || id > 2147483647) {
        return null;
    }
    return id;
}

function dbError(res, err) {
    console.log(err);
    res.status(500).send("Database error: " + err.message);
}

app.get("/", (req, res) => {
    res.render("index", { loggedIn: req.session.loggedIn, error: null });
});

app.post("/login", (req, res) => {
    knex.select().from("users")
        .where("username", req.body.username)
        .andWhere("password", req.body.password)
        .then(users => {
            if (users.length > 0) {
                req.session.loggedIn = true;
                res.redirect("/");
            } else {
                res.render("index", {
                    loggedIn: false,
                    error: "Invalid username or password."
                });
            }
        })
        .catch(err => dbError(res, err));
});

app.get("/logout", (req, res) => {
    req.session.destroy(err => {
        if (err) {
            console.log(err);
        }
        res.clearCookie("connect.sid");
        res.redirect("/");
    });
});

app.get("/countries", requireLogin, (req, res) => {
    knex.select().from("country").orderBy("country_id")
        .then(countries => {
            res.render("countries", { countries: countries });
        })
        .catch(err => dbError(res, err));
});

app.get("/addCountry", requireLogin, (req, res) => {
    res.render("countryForm", {
        heading: "Add Country",
        action: "/addCountry",
        buttonText: "Add Country",
        country: {},
        errors: []
    });
});

app.post("/addCountry", requireLogin, (req, res) => {
    const { data, errors } = validateCountry(req.body);

    if (errors.length > 0) {
        return res.status(400).render("countryForm", {
            heading: "Add Country",
            action: "/addCountry",
            buttonText: "Add Country",
            country: req.body,
            errors: errors
        });
    }

    knex("country").insert(data)
        .then(() => {
            res.redirect("/countries");
        })
        .catch(err => dbError(res, err));
});

app.get("/editCountry/:id", requireLogin, (req, res) => {
    const id = parseId(req.params.id);
    if (id === null) {
        return res.status(404).send("Country not found.");
    }

    knex("country").where("country_id", id).first()
        .then(country => {
            if (!country) {
                return res.status(404).send("Country not found.");
            }
            res.render("countryForm", {
                heading: "Edit Country",
                action: "/editCountry/" + id,
                buttonText: "Save Changes",
                country: country,
                errors: []
            });
        })
        .catch(err => dbError(res, err));
});

app.post("/editCountry/:id", requireLogin, (req, res) => {
    const id = parseId(req.params.id);
    if (id === null) {
        return res.status(404).send("Country not found.");
    }

    const { data, errors } = validateCountry(req.body);

    if (errors.length > 0) {
        return res.status(400).render("countryForm", {
            heading: "Edit Country",
            action: "/editCountry/" + id,
            buttonText: "Save Changes",
            country: req.body,
            errors: errors
        });
    }

    knex("country").where("country_id", id).update(data)
        .then(count => {
            if (count === 0) {
                return res.status(404).send("Country not found.");
            }
            res.redirect("/countries");
        })
        .catch(err => dbError(res, err));
});

app.post("/deleteCountry/:id", requireLogin, (req, res) => {
    const id = parseId(req.params.id);
    if (id === null) {
        return res.status(404).send("Country not found.");
    }

    knex("country").where("country_id", id).del()
        .then(() => {
            res.redirect("/countries");
        })
        .catch(err => dbError(res, err));
});

app.get("/map/:id", requireLogin, (req, res) => {
    const id = parseId(req.params.id);
    if (id === null) {
        return res.status(404).send("Country not found.");
    }

    knex("country").where("country_id", id).first()
        .then(country => {
            if (!country) {
                return res.status(404).send("Country not found.");
            }
            const mapUrl = "https://maps.google.com/maps?q="
                + encodeURIComponent(country.country_name)
                + "&output=embed";
            res.render("map", { country: country, mapUrl: mapUrl });
        })
        .catch(err => dbError(res, err));
});

app.listen(port, () => {
    console.log("Server running at http://localhost:" + port);
});

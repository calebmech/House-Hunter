const axios = require("axios");
const cheerio = require("cheerio");
const mail = require("@sendgrid/mail");
const fs = require("fs");
require("dotenv").config();

mail.setApiKey(process.env.SENDGRID_API_KEY);

const dbPath = __dirname + "//houses.txt";

const params =
  `?cat=3` + // Category: Student housing
  `&s=` + // Search string
  `&price_from=` + // Min price
  `&price_to=${700}` + // Max price
  `&zone=${1}` + // Zone: Walking distance
  `&spaces_from=${2}` + // Min rooms available
  `&spaces_to=` + // Max rooms available
  `&occupancy_select=${6}` + // Occupancy: May 1
  `&bedrooms_from=` + // Min rooms in house
  `&bedrooms_to=${6}` + // Max rooms in house
  `&internet=0` + // Default value
  `&furnished=0`; // Default value

const baseURL =
  "https://macoffcampus.mcmaster.ca/classifieds/category/student-rentals/";

function scrapeListings(url) {
  axios
    .get(url)
    .then(res => {
      console.log(url);
      const $ = cheerio.load(res.data);

      // Scrape next page
      let nextPage = $("a.nextpostslink").attr("href");
      if (nextPage) {
        scrapeListings(nextPage);
      }

      // Slice to remove "Featured Ads" section
      let articles = $("article.post > table").slice(3);
      let urls = [];
      articles.each((i, el) => {
        urls[i] = $(el).attr("rel");
      });
      return urls;
    })
    .then(urls => updateList(urls))
    .catch(err => console.log(err));
}

function updateList(urls) {
  fs.readFile(dbPath, "ascii", (err, data) => {
    if (err) console.log(err);
    data = data.trim().split("\n");

    // Remove already seen listings
    urls = urls.filter(url => !data.includes(url));

    // Add new listings
    if (urls.length > 0) {
      fs.appendFile(dbPath, urls.join("\n") + "\n", err => {
        if (err) console.log(err);

        let tense = urls.length == 1 ? "house was" : "houses were";
        console.log(`${urls.length} new ${tense} found!`);

        urls.forEach(url => {
          scrapeDetails(url);
        });
      });
    } else {
      console.log("No new houses were found.");
    }
  });
}

function scrapeDetails(url) {
  axios.get(url).then(res => {
    const $ = cheerio.load(res.data);

    // Format body of listing
    let titleSelector = "h1.entry-title";
    let address = $("div.entry-content.post div:nth-child(4)").text();
    let mapsUrl = `https://www.google.ca/maps/search/${address}/@43.2538592,-79.9419547,13.63z`;
    // Add links
    $(`<a href='${mapsUrl}'>See location on Google Maps</a><br>`).insertAfter(
      titleSelector
    );
    $(`<a href='${url}'>View posting</a><br>`).insertAfter(titleSelector);
    // Remove unwanted elements
    $("nav#nav-single").remove(); // Remove socials
    $("div#ocrc-entry-map").remove(); // Remove map
    $("div#ocrc_contact_email").remove(); // Remove contact form
    $("div.add-favourite").remove(); // Remove add to favourites
    $("div.entry-content-right > div:first-child").remove(); // Remove disclamer
    $("<br/>").insertAfter("div.listingid");
    let body = $("div#primary");

    if (process.env.NODE_ENV == "production") {
      // Email new listing
      const msg = {
        to: process.env.EMAILS.split(","),
        from: {
          name: "House Hunter",
          email: "househunter@calebmech.com"
        },
        subject: `New house!`,
        html: body.html()
      };
      mail.send(msg);
    } else {
      // Save listing body for testing
      fs.writeFile("listing.html", body.html(), err => {
        if (err) console.log(err);
      });
    }
  });
}

// Entry point

if (process.env.NODE_ENV == "production") {
  module.exports = async function(context, myTimer) {
    var timeStamp = new Date().toISOString();

    if (myTimer.isPastDue) {
      context.log("JavaScript is running late!");
    }
    context.log("JavaScript timer trigger function ran!", timeStamp);

    scrapeListings(baseURL + params.trim());
  };
} else {
  scrapeListings(baseURL + params.trim());
}

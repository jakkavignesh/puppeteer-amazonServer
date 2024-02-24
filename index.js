const express = require("express");
const puppeteer = require("puppeteer");
const cors = require("cors");
const mongoose = require("mongoose");
const nodemailer = require('nodemailer');
const app = express();
const port = 8080;

const DB = "mongodb://localhost:27017/?directConnection=true";
mongoose.connect(DB).then(() => {
    console.log("Connected to MongoDb");
  })
  .catch((err) => {
    console.log(err);
  });

let registerSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
  },
  email: {
    type: String,
    required: true,
  },
  password: {
    type: String,
    required: true,
  },
  cpassword: {
    type: String,
    required: true,
  },
  tokens: [
    {
      token: {
        type: String,
        required: true,
      },
    },
  ],
  products: [
    {
      productPlatform: {
        type: String,
        // required: true,
      },
      productName: {
        type: String,
        required: true,
      },
      productPrice: {
        type: String,
        required: true,
      },
      productMrp: {
        type: String,
        required: true,
      },
      productURL: {
        type: String,
        // required: true,
      },
      dateTime: {
        type: Date,
        default: Date.now,
      },
    },
  ],
});

app.use(cors());
app.use(express.json());

const sendEmail = async (email, scrapedData, url) => {
  try {
    const transporter = nodemailer.createTransport({
      service: "gmail",
      host: "smtp.gmail.com",
      port: 587,
      secure: false,
      auth: {
        user: "b15productpricetracker@gmail.com",
        pass: "nucvokqwzbgmkogp",
      },
    });
    const mailOptions = {
      from: {
        name: "B15 Product Pricetracker",
        address: "b15productpricetracker@gmail.com"
      },
      to: `${email}`, // replace with the recipient's email
      subject: 'Amazon Product Information',
      html: `
        <p><strong>Product Name:</strong> ${scrapedData.productName}</p>
        <p><strong>Product Price:</strong> ${scrapedData.productPrice}</p>
        <p><strong>Product MRP:</strong> ${scrapedData.productMrp}</p>
        <p><strong>Discount:</strong> ${scrapedData.discount}%</p>
        <p><strong>Product Rating:</strong> ${scrapedData.productRating}</p>
        <a href=${url}>Purchase</a>
      `
    };
    await transporter.sendMail(mailOptions);
    console.log('Email sent successfully');
  } catch (error) {
    console.error('Error sending email:', error);
  }
};

app.post("/scrapeAmazon", async (req, res) => {
  try {
    const { url, email } = req.body;

    if (!url) {
      return res.status(400).json({ error: "URL is required" });
    }
    console.log(email);
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    await page.setDefaultNavigationTimeout(60000);
    await page.goto(url);
    const scrapedData = await page.evaluate(() => {
      const getTextContent = (selector) => {
        const element = document.querySelector(selector);
        return element ? element.textContent.trim() : 'N/A';
      }
      const productName = getTextContent('.product-title-word-break');
      const productPriceStr = getTextContent('.a-price-whole');
      const productMrpStr = getTextContent('.a-text-price > .a-offscreen');
      const productRating = getTextContent('.a-size-base .a-color-base');

      const productPrice = parseFloat(productPriceStr.replace(/[^\d.]/g, ''), 10) || 'N/A';
      const productMrp = parseFloat(productMrpStr.replace(/[^\d.]/g, ''), 10) || productPrice;

      const discount = Math.round(((productMrp - productPrice) / productMrp) * 100);

      console.log(productName, productPrice, productMrp, discount, productRating)
      // Call the exposed sendEmail function to send an email with the scraped data
      // window.sendEmail(productName, productPrice, productMrp, discount, productRating);
      return { productName, productPrice, productMrp, discount, productRating };
    });
    await sendEmail(email, scrapedData, url);
    res.json({ data: scrapedData });

    const database = mongoose.model("userDetails", registerSchema);
    const userExists = await database.findOne({ email: email });
    await userExists.products.push({
      productPlatform: "Amazon",
      productName: scrapedData.productName,
      productPrice: scrapedData.productPrice,
      productMrp: scrapedData.productMrp,
      productURL: url,
    });
    await userExists.save();
    // res.json({ data: scrapedData });
    await browser.close();
    // await sendEmail(email, scrapedData);
  } catch (error) {
    console.error("Error during scraping:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});

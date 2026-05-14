// models/ContactMessage.js

import mongoose from "mongoose";

const contactMessageSchema = new mongoose.Schema(
    {
        fullName: {
            type: String,
            trim: true,
            minlength: 2,
            maxlength: 100,
        },

        email: {
            type: String,
            trim: true,
            lowercase: true,
            match: [
                /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/,
                "Please enter a valid email address",
            ],
        },

        phone: {
            type: String,
            trim: true,
            match: [
                /^[0-9+\-\s()]{7,20}$/,
                "Please enter a valid phone number",
            ],
        },
        message: {
            type: String,
            trim: true
        },
    },
    {
        timestamps: true,
    },
);

const ContactMessage = mongoose.model("ContactMessage", contactMessageSchema);

export default ContactMessage;
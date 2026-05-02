import xlsx from "xlsx";
import { AppError } from "../errors/customError.js";

export const FIELD_TYPE_MAPPING = {
  "text": "text_input",
  "text input": "text_input",
  "textarea": "text_area",
  "text area": "text_area",
  "dropdown": "dropdown",
  "select": "dropdown",
  "checkbox": "checkbox",
  "rating": "rating",
  "image": "image_upload",
  "image upload": "image_upload",
  "signature": "signature",
  "date": "date_picker",
  "date picker": "date_picker",
  "file": "file_upload",
  "file upload": "file_upload"
};

export const parseExcelToFields = async (fileBuffer, fileName) => {
  try {
    const workbook = xlsx.read(fileBuffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = xlsx.utils.sheet_to_json(worksheet);
    
    if (!data || data.length === 0) {
      throw new AppError("Excel file is empty", 400);
    }
    
    const fields = [];
    const validFieldTypes = Object.keys(FIELD_TYPE_MAPPING);
    
    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      
      // Validate required columns
      if (!row.fieldLabel && !row.FieldLabel && !row.label) {
        throw new AppError(`Row ${i + 2}: Field label is required`, 400);
      }
      
      const label = row.fieldLabel || row.FieldLabel || row.label;
      let fieldType = (row.fieldType || row.FieldType || row.type || "").toLowerCase();
      
      // Map field type to valid enum
      fieldType = FIELD_TYPE_MAPPING[fieldType] || fieldType;
      
      const validTypes = ["text_input", "text_area", "dropdown", "checkbox", "rating", "image_upload", "signature", "date_picker", "file_upload"];
      if (!validTypes.includes(fieldType)) {
        throw new AppError(`Row ${i + 2}: Invalid field type '${fieldType}'. Valid types: ${validTypes.join(", ")}`, 400);
      }
      
      const field = {
        label: label.trim(),
        type: fieldType,
        required: row.isRequired === "yes" || row.isRequired === "true" || row.isRequired === true || row.Required === "yes",
        section: row.section || row.Section || "General",
        helpText: row.helpText || row.HelpText || row.description || "",
        order: i,
        validation: {}
      };
      
      // Handle options for dropdown and checkbox
      if (field.type === "dropdown" || field.type === "checkbox") {
        let optionsStr = row.options || row.Options || "";
        if (typeof optionsStr === "string") {
          field.options = optionsStr.split(",").map(opt => opt.trim()).filter(opt => opt);
        } else if (Array.isArray(optionsStr)) {
          field.options = optionsStr;
        } else {
          field.options = [];
        }
      }
      
      // Handle rating scale
      if (field.type === "rating") {
        const ratingScale = parseInt(row.ratingScale || row.RatingScale || 5);
        field.ratingScale = Math.min(10, Math.max(1, ratingScale || 5));
      }
      
      // Handle validation rules
      if (row.minLength) field.validation.minLength = parseInt(row.minLength);
      if (row.maxLength) field.validation.maxLength = parseInt(row.maxLength);
      if (row.min) field.validation.min = parseInt(row.min);
      if (row.max) field.validation.max = parseInt(row.max);
      if (row.numericOnly === "yes" || row.numericOnly === "true") field.validation.numericOnly = true;
      if (row.emailOnly === "yes" || row.emailOnly === "true") field.validation.emailOnly = true;
      
      // Handle placeholder
      if (row.placeholder || row.Placeholder) {
        field.placeholder = (row.placeholder || row.Placeholder).trim();
      }
      
      fields.push(field);
    }
    
    return fields;
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(`Failed to parse Excel file: ${error.message}`, 400);
  }
};

export const generateExcelTemplate = () => {
  const template = [
    {
      fieldLabel: "Equipment Name",
      fieldType: "text_input",
      isRequired: "yes",
      section: "Basic Information",
      helpText: "Enter the name of the equipment",
      minLength: "2",
      maxLength: "100"
    },
    {
      fieldLabel: "Location",
      fieldType: "dropdown",
      isRequired: "yes",
      options: "Warehouse A,Warehouse B,Factory Floor,Office",
      section: "Basic Information",
      helpText: "Select the equipment location"
    },
    {
      fieldLabel: "Inspection Date",
      fieldType: "date_picker",
      isRequired: "yes",
      section: "Basic Information",
      helpText: "Select the inspection date"
    },
    {
      fieldLabel: "Safety Checks Completed",
      fieldType: "checkbox",
      isRequired: "yes",
      options: "Equipment powered off,Safety gear available,Area clear of hazards,Documentation ready",
      section: "Safety Checks",
      helpText: "Check all that apply"
    },
    {
      fieldLabel: "Overall Condition Rating",
      fieldType: "rating",
      isRequired: "yes",
      ratingScale: "5",
      section: "Safety Checks",
      helpText: "Rate from 1 (Poor) to 5 (Excellent)"
    },
    {
      fieldLabel: "Equipment Photos",
      fieldType: "image_upload",
      isRequired: "no",
      section: "Documentation",
      helpText: "Upload photos of the equipment"
    },
    {
      fieldLabel: "Additional Notes",
      fieldType: "text_area",
      isRequired: "no",
      section: "Documentation",
      helpText: "Any additional observations",
      maxLength: "500"
    },
    {
      fieldLabel: "Inspector Signature",
      fieldType: "signature",
      isRequired: "yes",
      section: "Documentation",
      helpText: "Sign using mouse or touch"
    }
  ];
  
  const worksheet = xlsx.utils.json_to_sheet(template);
  
  // Set column widths
  worksheet['!cols'] = [
    { wch: 25 }, // fieldLabel
    { wch: 15 }, // fieldType
    { wch: 10 }, // isRequired
    { wch: 20 }, // section
    { wch: 30 }, // helpText
    { wch: 15 }, // minLength
    { wch: 15 }, // maxLength
    { wch: 30 }, // options
    { wch: 10 }  // ratingScale
  ];
  
  const workbook = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(workbook, worksheet, "Checklist Template");
  
  return xlsx.write(workbook, { type: "buffer", bookType: "xlsx" });
};
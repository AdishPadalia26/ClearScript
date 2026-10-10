from pydantic import BaseModel, ConfigDict, Field


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class FieldValue(StrictModel):
    value: str | int | None = Field(description="The value read from the image, or null if missing or illegible.")
    confidence: float | None = Field(description="Confidence from 0 to 1, or null if confidence cannot be estimated.")
    reasoning: str | None = Field(description="Brief visual evidence for the value, or null if the value is null.")


class Patient(StrictModel):
    name: FieldValue = Field(description="Patient's name as written.")
    age: FieldValue = Field(description="Patient's age, as an integer when legible.")
    sex: FieldValue = Field(description="Patient's sex as written; preserve abbreviations such as M or F.")


class Doctor(StrictModel):
    name: FieldValue = Field(description="Prescriber's name, printed or legibly signed.")
    specialty: FieldValue = Field(description="Prescriber's specialty only when shown on the image.")
    registration_number: FieldValue = Field(description="Prescriber's license or registration number, if shown.")


class Medication(StrictModel):
    name: FieldValue = Field(description="Medication name or ingredient as written.")
    strength: FieldValue = Field(description="Concentration or strength per unit, such as 500 mg.")
    dose: FieldValue = Field(description="Amount taken per administration, not the total quantity dispensed.")
    frequency: FieldValue = Field(description="How often to take or use it, preserving the directions as written.")
    duration: FieldValue = Field(description="Length of treatment, if stated; do not copy it into frequency.")


class AdditionalInformation(StrictModel):
    prescription_date: str | None = Field(description="Date as written on the prescription, or null if absent or illegible.")
    diagnosis: str | None = Field(description="Diagnosis only if explicitly shown on the image.")
    notes: list[str] = Field(description="Other relevant text visible on the prescription.")
    signature_present: bool = Field(description="True only if a handwritten prescriber signature is visible.")


class Prescription(StrictModel):
    patient: Patient = Field(description="Patient information.")
    doctor: Doctor = Field(description="Prescriber information.")
    medications: list[Medication] = Field(description="One item for each medication on the prescription; empty only if none is shown.")
    additional_information: AdditionalInformation = Field(description="Other prescription details.")

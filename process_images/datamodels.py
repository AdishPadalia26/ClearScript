from pydantic import BaseModel


class FieldValue(BaseModel):
    value: str | int | None
    confidence: float | None
    reasoning: str | None


class Patient(BaseModel):
    name: FieldValue
    age: FieldValue
    sex: FieldValue


class Doctor(BaseModel):
    name: FieldValue
    specialty: FieldValue
    registration_number: FieldValue


class Medication(BaseModel):
    name: FieldValue
    strength: FieldValue
    dose: FieldValue
    frequency: FieldValue
    duration: FieldValue


class AdditionalInformation(BaseModel):
    prescription_date: str | None
    diagnosis: str | None
    notes: list[str]
    signature_present: bool


class Prescription(BaseModel):
    patient: Patient
    doctor: Doctor
    medications: list[Medication]
    additional_information: AdditionalInformation

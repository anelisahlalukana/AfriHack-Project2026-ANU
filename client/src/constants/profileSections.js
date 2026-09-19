export const profileSections = [
  {
    "title": "Personal information",
    "fields": [
      {
        "path": "personal.title",
        "label": "Title"
      },
      {
        "path": "personal.firstName",
        "label": "First name",
        "column": "first_name"
      },
      {
        "path": "personal.secondName",
        "label": "Second name",
        "column": "second_name"
      },
      {
        "path": "personal.surname",
        "label": "Surname",
        "column": "surname"
      },
      {
        "path": "personal.maidenName",
        "label": "Maiden name"
      },
      {
        "path": "personal.nationalityResidence",
        "label": "Nationality / country of residence",
        "column": "nationality"
      },
      {
        "path": "personal.dateOfBirth",
        "label": "Date of birth",
        "column": "date_of_birth",
        "type": "date"
      },
      {
        "path": "personal.idPassport",
        "label": "ID / passport",
        "column": "id_number"
      },
      {
        "path": "personal.maritalStatus",
        "label": "Marital status",
        "column": "marital_status"
      },
      {
        "path": "personal.marriageContract",
        "label": "Marriage contract"
      },
      {
        "path": "personal.marriageDate",
        "label": "Marriage date",
        "type": "date"
      },
      {
        "path": "personal.highestEducation",
        "label": "Highest education"
      },
      {
        "path": "personal.smokerStatus",
        "label": "Smoker status"
      },
      {
        "path": "personal.occupation",
        "label": "Occupation",
        "column": "occupation"
      },
      {
        "path": "personal.annualIncome",
        "label": "Annual income (ZAR)",
        "column": "annual_income",
        "type": "number"
      },
      {
        "path": "personal.executorOfWill",
        "label": "Executor of will"
      },
      {
        "path": "personal.hobbies",
        "label": "Hobbies"
      },
      {
        "path": "personal.yearsAtJob",
        "label": "Years at current job",
        "type": "number"
      }
    ]
  },
  {
    "title": "Time spent on work activities (%)",
    "description": "Estimate how you divide a typical working week across these activities. If applicable, enter percentages totalling 100% without counting the same time twice. Otherwise, leave these fields blank.",
    "fields": [
      {
        "path": "personal.workAllocation.admin",
        "label": "Office / administrative work (%)",
        "type": "number"
      },
      {
        "path": "personal.workAllocation.supervisor",
        "label": "Supervising / managing people (%)",
        "type": "number"
      },
      {
        "path": "personal.workAllocation.travelling",
        "label": "Travelling for work (%)",
        "type": "number"
      },
      {
        "path": "personal.workAllocation.manual",
        "label": "Physical / manual work (%)",
        "type": "number"
      }
    ]
  },
  {
    "title": "Your rewards programmes",
    "fields": [
      {
        "path": "personal.rewardsPrograms.gymGroup",
        "label": "Gym group"
      },
      {
        "path": "personal.rewardsPrograms.movieGroup",
        "label": "Movie group"
      },
      {
        "path": "personal.rewardsPrograms.airlineGroup",
        "label": "Airline group"
      },
      {
        "path": "personal.rewardsPrograms.groceryShop",
        "label": "Grocery shop"
      }
    ]
  },
  {
    "title": "Related person",
    "description": "Choose how this person is related to you. Add dependants and beneficiaries separately below.",
    "fields": [
      {
        "path": "spouseOrParent.relationship",
        "label": "Relationship to you",
        "options": [
          { "value": "spouse", "label": "Spouse" },
          { "value": "partner", "label": "Partner" },
          { "value": "parent", "label": "Parent" },
          { "value": "legal_guardian", "label": "Legal guardian" }
        ]
      },
      {
        "path": "spouseOrParent.title",
        "label": "Title",
        "type": "text"
      },
      {
        "path": "spouseOrParent.firstName",
        "label": "First name",
        "type": "text"
      },
      {
        "path": "spouseOrParent.secondName",
        "label": "Second name",
        "type": "text"
      },
      {
        "path": "spouseOrParent.surname",
        "label": "Surname",
        "type": "text"
      },
      {
        "path": "spouseOrParent.maidenName",
        "label": "Maiden name",
        "type": "text"
      },
      {
        "path": "spouseOrParent.nationalityResidence",
        "label": "Nationality / residence",
        "type": "text"
      },
      {
        "path": "spouseOrParent.idNumber",
        "label": "ID number",
        "type": "text"
      },
      {
        "path": "spouseOrParent.highestEducation",
        "label": "Highest education",
        "type": "text"
      },
      {
        "path": "spouseOrParent.occupation",
        "label": "Occupation",
        "type": "text"
      },
      {
        "path": "spouseOrParent.annualIncome",
        "label": "Annual income (ZAR)",
        "type": "number"
      },
      {
        "path": "spouseOrParent.smokerStatus",
        "label": "Smoker status",
        "type": "text"
      },
      {
        "path": "spouseOrParent.mobileNumber",
        "label": "Mobile number",
        "type": "tel"
      },
      {
        "path": "spouseOrParent.marriageDate",
        "relationships": ["spouse", "partner"],
        "label": "Marriage date (if applicable)",
        "type": "date"
      }
    ]
  },
  {
    "title": "Related person’s time spent on work activities (%)",
    "description": "Estimate how this person divides a typical working week across these activities. If applicable, enter percentages totalling 100% without counting the same time twice. Otherwise, leave these fields blank.",
    "fields": [
      {
        "path": "spouseOrParent.workAllocation.admin",
        "label": "Office / administrative work (%)",
        "type": "number"
      },
      {
        "path": "spouseOrParent.workAllocation.supervisor",
        "label": "Supervising / managing people (%)",
        "type": "number"
      },
      {
        "path": "spouseOrParent.workAllocation.travelling",
        "label": "Travelling for work (%)",
        "type": "number"
      },
      {
        "path": "spouseOrParent.workAllocation.manual",
        "label": "Physical / manual work (%)",
        "type": "number"
      }
    ]
  },
  {
    "title": "Related person’s rewards programmes",
    "fields": [
      {
        "path": "spouseOrParent.rewardsPrograms.gymGroup",
        "label": "Gym group"
      },
      {
        "path": "spouseOrParent.rewardsPrograms.movieGroup",
        "label": "Movie group"
      },
      {
        "path": "spouseOrParent.rewardsPrograms.airlineGroup",
        "label": "Airline group"
      },
      {
        "path": "spouseOrParent.rewardsPrograms.groceryShop",
        "label": "Grocery shop"
      }
    ]
  },
  {
    "title": "Referral",
    "fields": [
      {
        "path": "personal.referral.referredBy",
        "label": "Referred by"
      },
      {
        "path": "personal.referral.mobile",
        "label": "Mobile",
        "type": "tel"
      },
      {
        "path": "personal.referral.idNumber",
        "label": "ID number"
      }
    ]
  },
  {
    "title": "Employment",
    "fields": [
      {
        "path": "employment.employerName",
        "label": "Employer",
        "column": "employer_name"
      },
      {
        "path": "employment.employeeNumber",
        "label": "Employee number"
      },
      {
        "path": "employment.employmentType",
        "label": "Employment type"
      },
      {
        "path": "employment.employmentDate",
        "label": "Employment date",
        "type": "date"
      },
      {
        "path": "employment.incomeTaxNumber",
        "label": "Income tax number"
      }
    ]
  },
  {
    "title": "HR / benefits contact",
    "fields": [
      {
        "path": "employment.hrBenefitsContact.name",
        "label": "Name"
      },
      {
        "path": "employment.hrBenefitsContact.number",
        "label": "Number",
        "type": "tel"
      },
      {
        "path": "employment.hrBenefitsContact.email",
        "label": "Email",
        "type": "email"
      }
    ]
  },
  {
    "title": "Doctor",
    "fields": [
      {
        "path": "doctor.nameSurname",
        "label": "Name and surname"
      },
      {
        "path": "doctor.practice",
        "label": "Practice"
      },
      {
        "path": "doctor.address",
        "label": "Address"
      },
      {
        "path": "doctor.contacts",
        "label": "Contact details"
      }
    ]
  },
  {
    "title": "Salary banking",
    "fields": [
      {
        "path": "banking.salary.bank",
        "label": "Bank",
        "column": "bank_name"
      },
      {
        "path": "banking.salary.accountType",
        "label": "Account type",
        "column": "bank_account_type"
      },
      {
        "path": "banking.salary.branchCode",
        "label": "Branch code"
      },
      {
        "path": "banking.salary.accountNumber",
        "label": "Account number",
        "column": "bank_account_number"
      }
    ]
  },
  {
    "title": "Alternate banking",
    "fields": [
      {
        "path": "banking.alternate.bank",
        "label": "Bank"
      },
      {
        "path": "banking.alternate.accountType",
        "label": "Account type"
      },
      {
        "path": "banking.alternate.branchCode",
        "label": "Branch code"
      },
      {
        "path": "banking.alternate.accountNumber",
        "label": "Account number"
      }
    ]
  },
  {
    "title": "Contact information",
    "fields": [
      {
        "path": "contact.cellNumber",
        "label": "Cell number",
        "column": "contact_mobile",
        "type": "tel"
      },
      {
        "path": "contact.telephoneHome",
        "label": "Home telephone",
        "type": "tel"
      },
      {
        "path": "contact.telephoneWork",
        "label": "Work telephone",
        "type": "tel"
      },
      {
        "path": "contact.skypeName",
        "label": "Skype name"
      },
      {
        "path": "contact.privateEmail",
        "label": "Private email",
        "column": "contact_email",
        "type": "email"
      },
      {
        "path": "contact.workEmail",
        "label": "Work email",
        "type": "email"
      }
    ]
  },
  {
    "title": "Addresses",
    "fields": [
      {
        "path": "addresses.primaryAddress",
        "label": "Primary address",
        "column": "physical_address"
      },
      {
        "path": "addresses.yearsAtPrimary",
        "label": "Years at primary address",
        "type": "number"
      },
      {
        "path": "addresses.postalAddress",
        "label": "Postal address"
      },
      {
        "path": "addresses.otherAddress",
        "label": "Other address"
      },
      {
        "path": "addresses.yearsAtOther",
        "label": "Years at other address",
        "type": "number"
      }
    ]
  }
]

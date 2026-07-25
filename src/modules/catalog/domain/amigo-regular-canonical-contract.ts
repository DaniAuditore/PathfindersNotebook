import type { RequirementChildRole, RequirementModality } from "./official-template";

export const CANONICAL_AMIGO_SOURCE = {
  sourceCode: "dsa.amigo.es",
  id: "d57be2a8-7a6a-5fdb-9181-99aaad22ebaa",
  title: "Tarjeta de Clase Amigo",
} as const;

export const CANONICAL_AMIGO_FAMILY = {
  sourceCode: "amigo",
  id: "56590aef-c83d-56a0-be21-ff87940bb156",
  title: "Amigo",
} as const;

export const CANONICAL_AMIGO_LEVEL = {
  sourceCode: "amigo.regular",
  id: "e2f7bfec-2ce3-5e78-ad31-d16a2611bef6",
  title: "Amigo",
} as const;

export const CANONICAL_AMIGO_SECTIONS = [
  ["amigo.reg.s01", "86d1e0c8-2bfe-5d98-9188-ad9313cbcec9", "generales", "Generales"],
  ["amigo.reg.s02", "17ad89fe-6276-514a-b13b-ddcaee004e87", "descubrimiento-espiritual", "Descubrimiento espiritual"],
  ["amigo.reg.s03", "38da4cec-59a2-511d-a43f-e8820480e772", "sirviendo-a-los-demas", "Sirviendo a los demás"],
  ["amigo.reg.s04", "822013f9-128e-5bcf-839d-9727da6e55e8", "desarrollo-de-la-amistad", "Desarrollo de la amistad"],
  ["amigo.reg.s05", "9a02d559-e6ec-520d-9992-6af1a925ef5d", "salud-y-aptitud-fisica", "Salud y aptitud física"],
  ["amigo.reg.s06", "f59662f4-e0f7-5dc0-9ac2-d51863cd2a82", "organizacion-y-liderazgo", "Organización y liderazgo"],
  ["amigo.reg.s07", "98083262-41e9-5f00-ada3-e939a34aece9", "estudio-de-la-naturaleza", "Estudio de la naturaleza"],
  ["amigo.reg.s08", "f3eb59cd-0f94-5b85-8a67-13110fe913d8", "arte-de-acampar", "Arte de acampar"],
  ["amigo.reg.s09", "2e2c0d3a-2b9f-5f77-9d8f-1b10c48be83f", "estilo-de-vida", "Estilo de vida"],
] as const;

/**
 * Exact deterministic IDs and visible labels in canonical traversal order. This production
 * contract imports neither the mutable payload nor the test-only visual transcription.
 * Updating it requires an explicit source review.
 */
export const CANONICAL_AMIGO_REQUIREMENTS = [
  ["amigo.reg.s01.r01","7cf5090a-2aa5-5bb5-9367-48d55d17e07f","Tener como mínimo 10 años de edad."],
  ["amigo.reg.s01.r02","1c17e4ff-af10-5dff-b53a-af07e4dacfac","Ser miembro activo del club de Conquistadores."],
  ["amigo.reg.s01.r03","adb6d872-15bd-5fa5-823b-b78a7c0b75f6","Memorizar y explicar el Voto y la Ley del Conquistador."],
  ["amigo.reg.s01.r04","07eefee9-43b4-59eb-9536-98fb2907a676","Leer el libro del club de Lectura Juvenil del año en curso."],
  ["amigo.reg.s01.r05","6881e8f8-1dbc-5836-a3fb-49f1c8bc9ab3","Leer el libro Vaso de Barro."],
  ["amigo.reg.s01.r06","df29c6bd-0812-51b6-8d60-dc06fcb99cb5","Participar activamente de la Clase Bíblica de su club."],
  ["amigo.reg.s02.r01","e8501871-8741-501c-8ec6-ef095d9991e5","Memorizar y demostrar su conocimiento en:"],
  ["amigo.reg.s02.r01.c01","ba4cbc35-05c1-58d3-9c3b-92a39b1ca369","Creación: Lo que Dios creó en cada día de la creación."],
  ["amigo.reg.s02.r01.c02","09cb0b47-4b69-55c2-a488-22a6b4db260b","10 Plagas: Qué plagas cayeron sobre Egipto."],
  ["amigo.reg.s02.r01.c03","01f7ad22-0a77-563f-a032-f9d73fd85c96","12 Tribus: El Nombre de cada una de las tribus de Israel."],
  ["amigo.reg.s02.r01.c04","84ccdade-1b7f-526b-8c76-b1690aed7225","39 libros del antiguo testamento y demostrar habilidad para encontrar cualquiera de ellos."],
  ["amigo.reg.s02.r02","9ec5eb49-a042-508a-8d43-866bc1391580","Leer y explicar los siguientes versículos:"],
  ["amigo.reg.s02.r02.c01","5c0f0787-e434-5ab9-a0b6-e080f4dc6bfb","Juan 3:16"],
  ["amigo.reg.s02.r02.c02","db5dcd0f-7479-5014-8fb7-cd9eb39f211f","Efesios 6:1-3"],
  ["amigo.reg.s02.r02.c03","bead8ff1-c3b9-510e-933f-4413bb0c238e","II Timoteo 3:16"],
  ["amigo.reg.s02.r02.c04","187bc553-0b8d-5f1f-8d12-a08ab79c3f2c","Salmo 1"],
  ["amigo.reg.s02.r03","75e12ef7-2684-567f-8aa7-a6efda299d96","Lectura Bíblica:"],
  ["amigo.reg.s02.r03.c01","00521b6e-a1c0-5239-b6e8-f8c793231f69","Gn 1"],
  ["amigo.reg.s02.r03.c02","c134f454-ec21-5f5d-8b66-3160fc8a2a5e","Gn 2"],
  ["amigo.reg.s02.r03.c03","bedc1ace-f1ef-5c79-8593-ac50a101e869","Gn 3"],
  ["amigo.reg.s02.r03.c04","c78ef850-7556-5840-9e79-4e5d5283f8b1","Gn 4:1-16"],
  ["amigo.reg.s02.r03.c05","0727cd5a-e1a8-5db2-a25b-f4855e443322","Gn 6:11-22"],
  ["amigo.reg.s02.r03.c06","09497e14-7c22-545e-b394-7b86aab41948","Gn 7"],
  ["amigo.reg.s02.r03.c07","370be5e9-5b4a-5e46-8d80-61161670c21f","Gn 8"],
  ["amigo.reg.s02.r03.c08","e8b8538d-4995-520a-afc2-1f9fe937c4c9","Gn 9:1-19"],
  ["amigo.reg.s02.r03.c09","75ff2748-f0fe-59cf-8365-9c51703177ae","Gn 11:1-9"],
  ["amigo.reg.s02.r03.c10","31694330-76c7-50c5-b0e1-d0f8181600fd","Gn 12:1-10"],
  ["amigo.reg.s02.r03.c11","0151bdef-e3f2-5f37-a835-d84f4e73245a","Gn 13"],
  ["amigo.reg.s02.r03.c12","75ac7947-5f12-5f57-a5fc-9d71f3192615","Gn 14;18-24"],
  ["amigo.reg.s02.r03.c13","f8401244-6e18-5356-9623-bce2429103d8","Gn 15"],
  ["amigo.reg.s02.r03.c14","6ecaf7f7-9539-5497-a838-f62aadf40e18","Gn 17:1-8;15-22"],
  ["amigo.reg.s02.r03.c15","16204fea-7c94-5d60-8119-9e3820c183d4","Gn 18:1-15"],
  ["amigo.reg.s02.r03.c16","e589dd73-178a-560b-9abe-001a94602c23","Gn 18:16-33"],
  ["amigo.reg.s02.r03.c17","62fefd8f-ae4c-56cc-99dc-2e09eadf18fe","Gn 19:1-29"],
  ["amigo.reg.s02.r03.c18","98164263-76f7-51fc-8e57-aaa0c4706728","Gn 21:1-21"],
  ["amigo.reg.s02.r03.c19","ad1ea858-0f14-567b-af94-3506bf37ecf0","Gn 22:1-19"],
  ["amigo.reg.s02.r03.c20","8a1a9fc7-7e7e-51d8-b0d1-be18bdb07925","Gn 23"],
  ["amigo.reg.s02.r03.c21","215ce296-4bf7-567d-98dd-d059afde7c13","Gn 24:1-46,48"],
  ["amigo.reg.s02.r03.c22","2c7f0c9c-1432-59b5-b9a0-804739716801","Gn 24:52-67"],
  ["amigo.reg.s02.r03.c23","7cde65c9-eb12-5718-8983-ef957f80601d","Gn 27"],
  ["amigo.reg.s02.r03.c24","0e062c1e-45ba-559e-ac16-1465e9f6ee9f","Gn 28"],
  ["amigo.reg.s02.r03.c25","53ee8f3d-a85a-573f-ad24-7a8b2e1d43a2","Gn 29"],
  ["amigo.reg.s02.r03.c26","d2afc2f7-4caf-5c7c-9c31-3f15c7dff70b","Gn 30:25-31; 31:2-3, 17-18"],
  ["amigo.reg.s02.r03.c27","b6cb4f90-74a9-5270-91f6-c5aed5340941","Gn 32"],
  ["amigo.reg.s02.r03.c28","be2157b4-7477-5075-8d81-8376837be655","Gn 33"],
  ["amigo.reg.s02.r03.c29","ae94b7d0-22b8-5d13-a7cf-27b8afbb3679","Gn 37"],
  ["amigo.reg.s02.r03.c30","a5096871-9c49-52f8-abee-b7d32330c2e6","Gn 39"],
  ["amigo.reg.s02.r03.c31","cad94e2c-ddec-5036-82ae-18c2aaf674e9","Gn 40"],
  ["amigo.reg.s02.r03.c32","72685de1-8352-532e-94ac-00ea809dd1e3","Gn. 41"],
  ["amigo.reg.s02.r03.c33","5c857692-d5a5-52bd-bb66-a871d9a44fec","Gn. 42"],
  ["amigo.reg.s02.r03.c34","6cd0a5ba-0e1b-5b8f-a9d5-7eed55f12782","Gn. 43"],
  ["amigo.reg.s02.r03.c35","21d44126-6bd0-5418-8a87-60b710fd219b","Gn. 44"],
  ["amigo.reg.s02.r03.c36","dcfcf20f-9c04-5100-ad14-5eac671446ec","Gn. 45"],
  ["amigo.reg.s02.r03.c37","d93a7640-3a78-5a7e-92a9-b12dc145f22d","Gn. 47"],
  ["amigo.reg.s02.r03.c38","47e88294-dfc0-5428-a150-2a63aee216fb","Gn 50"],
  ["amigo.reg.s02.r03.c39","36f2fdc0-7ae3-540a-a34c-93bbd0dfa656","Éx 1"],
  ["amigo.reg.s02.r03.c40","ddf817b6-9596-5123-91bc-60c601ae7211","Éx 2"],
  ["amigo.reg.s02.r03.c41","1cd614fb-dc9e-5ff4-b999-bc22713c0167","Éx 3"],
  ["amigo.reg.s02.r03.c42","d0ce3513-47d2-5da4-b5fc-696e2061bd31","Éx 4:1-17;27-31"],
  ["amigo.reg.s02.r03.c43","2ff77bea-5508-5b1c-b2fa-659d3104a991","Éx 5"],
  ["amigo.reg.s02.r03.c44","7dcac2a1-d429-5d6d-a14f-eb8580419838","Éx 7"],
  ["amigo.reg.s02.r03.c45","69b899ae-8faa-5b02-b515-13cf222ff0eb","Éx 8"],
  ["amigo.reg.s02.r03.c46","94278a00-0858-5694-943a-7683e158fe6b","Éx 9"],
  ["amigo.reg.s02.r03.c47","c3628fcb-cd4f-56a6-bbaa-6acc878a3fe4","Éx 10, 11"],
  ["amigo.reg.s02.r03.c48","efb9814d-ad9e-507e-b4ef-cd1a338861c9","Éx 12"],
  ["amigo.reg.s02.r03.c49","c3e7308a-2302-5137-86db-c68a772a0004","Éx 13:17-22; 14"],
  ["amigo.reg.s02.r03.c50","ef2b55e9-4a44-5df7-a9d0-0c2dd7e7582a","Éx 15:22-27; 16"],
  ["amigo.reg.s02.r03.c51","4039f23f-0b5a-53d3-97f5-8eeaf1f0c8ac","Éx 17"],
  ["amigo.reg.s02.r03.c52","4d34803c-c6a8-5bea-a3c0-b27d06c7e568","Éx 18"],
  ["amigo.reg.s02.r03.c53","78b5fee4-83c1-59fd-814f-152ffce6977f","Éx 19"],
  ["amigo.reg.s02.r03.c54","a3cfd5d2-fee1-5249-a879-da4b9b7dc819","Éx 20"],
  ["amigo.reg.s02.r03.c55","01e8a497-1909-54a2-8047-5b7ee8572d94","Éx 24"],
  ["amigo.reg.s02.r03.c56","fae25a95-8736-5ac5-bc05-4e709f949990","Éx 32"],
  ["amigo.reg.s02.r03.c57","33b19fae-83a1-5bc2-a662-77c2fa66986d","Éx 33"],
  ["amigo.reg.s02.r03.c58","e076bed3-58c1-512c-bc5b-a7becb1cf52c","Éx 34:1-14; 29-35"],
  ["amigo.reg.s02.r03.c59","c175b259-9657-5144-a9ba-4bf3cd114fd2","Éx 35:4-29 e 40"],
  ["amigo.reg.s03.r01","18c061c4-a750-5beb-8bf8-1607cef14e34","Dedicar dos horas ayudando a alguien en su comunidad, a través de dos de las siguientes actividades:"],
  ["amigo.reg.s03.r01.c01","2baa19b1-b2a0-5b4f-94fe-ecc5a46525da","Visitar a alguien que necesita de amistad y orar con esa persona."],
  ["amigo.reg.s03.r01.c02","c9cc14ac-2324-562d-902d-4a25970200ea","Ofrecer y llevar alimento a alguien carente."],
  ["amigo.reg.s03.r01.c03","97ea217d-6fac-5c87-9129-7d4853d11a7f","Participar de un proyecto ecológico o educativo."],
  ["amigo.reg.s03.r02","c03cd70f-dee3-518d-bd50-e62e586628b7","Escribir una redacción de cómo ser un buen ciudadano en el hogar y en la escuela (hoja tamaño carta, letra Arial 12)"],
  ["amigo.reg.s04.r01","661138a8-52ba-5d8d-bd3f-066e8ef38e0d","Mencionar diez cualidades de un buen amigo y presentar cuatro situaciones diarias en las que usted practicó la Regla de Oro de Mateo 7:12."],
  ["amigo.reg.s04.r02","aca9cdff-0866-5b6b-85fc-fb9d8831aecc","Saber cantar el Himno Nacional de su país y conocer su historia. Saber el nombre del autor de la letra y de la música del himno."],
  ["amigo.reg.s05.r01","c8b7132a-cfe8-5261-a997-38c136958740","Completar una de las siguientes especialidades:"],
  ["amigo.reg.s05.r01.c01","1bb1090b-dafa-5dc3-a232-721975e64848","Natación I"],
  ["amigo.reg.s05.r01.c02","58a971e0-1f06-5601-ad3f-c0dc96c87a93","Aptitud física"],
  ["amigo.reg.s05.r01.c03","540e9b44-e598-5ab6-97ce-66767b5a6b5d","Nudos y amarras"],
  ["amigo.reg.s05.r01.c04","162375c5-60a0-5ea5-b359-ef0b9a7f8a25","Seguridad básica en el agua"],
  ["amigo.reg.s05.r02","8490a466-5499-5b08-a491-b75e694488ec","Utilizando la experiencia de Daniel:"],
  ["amigo.reg.s05.r02.c01","a30ba781-25b1-5c2c-bd2e-7edc652efd31","Explicar los principios de temperancia que él defendió, o participar de una presentación o escenificación de Daniel"],
  ["amigo.reg.s05.r02.c02","c540ab3f-27b7-51d6-93de-ca92496b00b4","Memorizar y explicar Daniel 1:8."],
  ["amigo.reg.s05.r02.c03","51c57ab3-edaf-599b-b9ce-e63848f1ffe8","Escribir su compromiso personal de seguir un estilo de vida saludable."],
  ["amigo.reg.s05.r03","e8ac111e-4f87-5947-af2f-1544d850ef58","Aprender los principios de una dieta saludable y ayudar a preparar un cuadro con los grupos básicos de alimentos."],
  ["amigo.reg.s06.r01","04ce30e5-d1db-5039-b73c-62ccc3f4ac2e","Através de la observación, acompañar todo el proceso de planeamiento hasta la ejecución de una caminata de 5 kilómetros."],
  ["amigo.reg.s07.r01","1de13e66-92e6-5208-918a-5a9614597733","Completar una de las siguientes especialidades:"],
  ["amigo.reg.s07.r01.c01","022b6668-edda-5a22-88c7-7e2ba15177c0","Felinos"],
  ["amigo.reg.s07.r01.c02","1aa55ec6-9bd7-57ef-a5e1-3efe606ffe88","Perros"],
  ["amigo.reg.s07.r01.c03","a58b10aa-794d-551f-8236-a3084c94b224","Mamíferos"],
  ["amigo.reg.s07.r01.c04","4f833097-34c1-537f-ae8a-8911d577de7d","Semillas"],
  ["amigo.reg.s07.r01.c05","13641db5-9783-5f86-96db-b4801b174dbf","Aves domésticas"],
  ["amigo.reg.s07.r02","6b875559-fc6b-5384-89b5-54b4efbcd4ae","Aprender y demostrar una forma para purificar el agua y escribir un párrafo destacando el significado de Jesús como el agua de Vida."],
  ["amigo.reg.s07.r03","609e8588-8e8a-5ebf-988d-49ed87a93d70","Aprender y armar tres tipos diferentes de carpas en lugares apropiados."],
  ["amigo.reg.s08.r01","ff553272-a6db-5d2d-92c7-3d2b3c42b6a0","Demostrar cómo cuidar correctamente de una cuerda. Hacer y explicar el uso práctico de los siguientes nudos:"],
  ["amigo.reg.s08.r01.c01","3dca8df2-edac-55d1-b5cf-57277ec31cf5","Simple o Cote"],
  ["amigo.reg.s08.r01.c02","7325f4c1-71f6-5db6-901f-55c7d3983d5b","Falso"],
  ["amigo.reg.s08.r01.c03","5c8cc2ec-6df1-50c8-9c8a-6154ff87f424","Verdadero o Llano"],
  ["amigo.reg.s08.r01.c04","208aa7ec-2e5e-5cdb-b075-ab8870f2569f","Cirujano"],
  ["amigo.reg.s08.r01.c05","17b561dd-19c4-59b3-84e7-a73f14bcf3b0","As de guía"],
  ["amigo.reg.s08.r01.c06","84463587-d208-55c5-b0a5-64ba0ffc93ce","As de guía doble"],
  ["amigo.reg.s08.r01.c07","73876f82-32ed-56fa-b7cc-c8396368a4e9","Escota"],
  ["amigo.reg.s08.r01.c08","fd687539-7780-56a3-9dc7-d5f395b05176","Margarita"],
  ["amigo.reg.s08.r01.c09","1a81399c-54cf-505a-bb2d-ce6728ce3f42","Pescador"],
  ["amigo.reg.s08.r01.c10","0f89faaf-e06e-518a-91c8-965eb14e06e8","Ancia"],
  ["amigo.reg.s08.r01.c11","fe7c4f20-5a04-5edf-b1cd-f212d933a86e","Ballestrinque"],
  ["amigo.reg.s08.r01.c12","a43c8a2f-266f-5b00-925b-ef53ad62f4bb","Vuelta de gancho"],
  ["amigo.reg.s08.r01.c13","26a64b7f-7a69-5fed-8472-b58466d8e45b","Leñador"],
  ["amigo.reg.s08.r01.c14","ace1422a-ce0f-570f-948b-02b7226a1136","Calabrote"],
  ["amigo.reg.s08.r02","ca2fbace-52ca-5b6b-b0a4-de70461d1a3d","Completar la especialidad de Arte de acampar I"],
  ["amigo.reg.s08.r03","293ff4b2-188e-5a9a-95f7-94a3ac7f1f08","Presentar en forma escrita 10 reglas para una caminata y explicar qué hacer en caso que esté perdido."],
  ["amigo.reg.s08.r04","5ec0691d-bcd8-5156-b3c0-1c2d70e569e2","Aprender las señales para seguir una pista. Preparar y seguir una pista con un mínimo de 10 señales que también pueda ser seguida por otros."],
  ["amigo.reg.s09.r01","35724768-f89b-5718-9b39-63c977ab9b64","Completar una especialidad en el área de Artes y Habilidades Manuales."],
] as const;

const ROOT_MODALITIES: Readonly<Record<string, readonly RequirementModality[]>> = {
  "amigo.reg.s01.r01": ["administrative", "automatic"],
  "amigo.reg.s01.r02": ["administrative", "automatic"],
  "amigo.reg.s01.r03": ["memorization_oral"],
  "amigo.reg.s01.r04": ["reading"],
  "amigo.reg.s01.r05": ["reading"],
  "amigo.reg.s01.r06": ["participation"],
  "amigo.reg.s02.r01": ["memorization_oral"],
  "amigo.reg.s02.r02": ["reading", "memorization_oral"],
  "amigo.reg.s02.r03": ["reading"],
  "amigo.reg.s03.r01": ["participation", "practical_in_person"],
  "amigo.reg.s03.r02": ["written"],
  "amigo.reg.s04.r01": ["written"],
  "amigo.reg.s04.r02": ["memorization_oral"],
  "amigo.reg.s05.r01": ["specialty", "practical_in_person"],
  "amigo.reg.s05.r02": ["memorization_oral", "written", "participation"],
  "amigo.reg.s05.r03": ["participation", "practical_in_person"],
  "amigo.reg.s06.r01": ["participation", "practical_in_person"],
  "amigo.reg.s07.r01": ["specialty", "practical_in_person"],
  "amigo.reg.s07.r02": ["written", "practical_in_person"],
  "amigo.reg.s07.r03": ["practical_in_person"],
  "amigo.reg.s08.r01": ["practical_in_person"],
  "amigo.reg.s08.r02": ["specialty", "practical_in_person"],
  "amigo.reg.s08.r03": ["written", "practical_in_person"],
  "amigo.reg.s08.r04": ["practical_in_person"],
  "amigo.reg.s09.r01": ["specialty", "practical_in_person"],
};

const CHILD_GROUPS: Readonly<Record<string, readonly [RequirementChildRole, readonly RequirementModality[]]>> = {
  "amigo.reg.s02.r01": ["step", ["memorization_oral"]],
  "amigo.reg.s02.r02": ["checklist_item", ["reading", "memorization_oral"]],
  "amigo.reg.s02.r03": ["checklist_item", ["reading"]],
  "amigo.reg.s03.r01": ["option", ["participation", "practical_in_person"]],
  "amigo.reg.s05.r01": ["option", ["specialty", "practical_in_person"]],
  "amigo.reg.s07.r01": ["option", ["specialty", "practical_in_person"]],
  "amigo.reg.s08.r01": ["checklist_item", ["practical_in_person"]],
};

const COMPLETION_BY_ROOT: Readonly<Record<string, string>> = {
  "amigo.reg.s02.r01": "all_children",
  "amigo.reg.s02.r02": "all_children",
  "amigo.reg.s02.r03": "all_children",
  "amigo.reg.s03.r01": "at_least_n:2",
  "amigo.reg.s05.r01": "at_least_one",
  "amigo.reg.s05.r02": "all_children",
  "amigo.reg.s07.r01": "at_least_one",
  "amigo.reg.s08.r01": "all_children",
};

export interface CanonicalRequirementSemantics {
  readonly childRole: RequirementChildRole | undefined;
  readonly completion: string;
  readonly modalities: readonly RequirementModality[];
}

export function canonicalRequirementSemantics(sourceCode: string): CanonicalRequirementSemantics | undefined {
  const parentSourceCode = sourceCode.includes(".c") ? sourceCode.slice(0, sourceCode.lastIndexOf(".c")) : undefined;
  if (!parentSourceCode) {
    const modalities = ROOT_MODALITIES[sourceCode];
    return modalities ? { childRole: undefined, completion: COMPLETION_BY_ROOT[sourceCode] ?? "direct", modalities } : undefined;
  }
  if (parentSourceCode === "amigo.reg.s05.r02") {
    const child = sourceCode.slice(-3);
    const modalities = child === "c01" ? ["memorization_oral", "participation"] as const : child === "c02" ? ["memorization_oral"] as const : ["written"] as const;
    return { childRole: "step", completion: "direct", modalities };
  }
  const group = CHILD_GROUPS[parentSourceCode];
  return group ? { childRole: group[0], completion: "direct", modalities: group[1] } : undefined;
}

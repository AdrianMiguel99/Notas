// data.js
const SEMESTRE = "IIS-2026";

const cursos = [
  {
    id: "so",
    nombre: "Sistemas Operativos",
    evaluaciones: [
      { nombre: "Tarea 1", nota: 85, peso: 10, fecha: "2026-02-10", link: "" },
      { nombre: "Quiz 1",  nota: 70, peso: 5,  fecha: "2026-02-20", link: "" },
      { nombre: "Examen 1",nota: null, peso: 20, fecha: "2026-03-05", link: "" },
    ],
  },
  {
    id: "redes",
    nombre: "Redes de Comunicación de Datos",
    evaluaciones: [
      { nombre: "E1", nota: 54, peso: 10, fecha: "2026-02-08", link: "" },
      { nombre: "E2", nota: 48, peso: 12, fecha: "2026-02-22", link: "" },
      { nombre: "E3", nota: null, peso: 25, fecha: "2026-03-10", link: "" },
    ],
  },
  {
    id: "opt",
    nombre: "Métodos de Modelado y Optimización",
    evaluaciones: [
      { nombre: "Prácticas", nota: 95, peso: 15, fecha: "2026-02-12", link: "" },
      { nombre: "Exposiciones", nota: 95, peso: 10, fecha: "2026-02-18", link: "" },
      { nombre: "Evaluaciones", nota: null, peso: 25, fecha: "2026-03-12", link: "" },
    ],
  },
];

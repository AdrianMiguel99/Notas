export function evaluationsFor(data, courseId, typeId = null) {
  return data.evaluations.filter((evaluation) =>
    evaluation.courseId === courseId &&
    (typeId === null || evaluation.typeId === typeId)
  );
}

export function calculateCourse(data, course) {
  let accumulated = 0;
  let completedWeight = 0;

  for (const type of course.assessmentTypes) {
    const graded = evaluationsFor(data, course.id, type.id)
      .filter((evaluation) => evaluation.grade !== null && evaluation.grade !== undefined);
    if (!graded.length) continue;

    const average = graded.reduce((sum, evaluation) => sum + Number(evaluation.grade), 0) / graded.length;
    accumulated += (average * type.weight) / 100;
    completedWeight += type.weight;
  }

  const projected = completedWeight > 0 ? accumulated / (completedWeight / 100) : 0;
  return { accumulated, completedWeight, projected };
}

export function calculateOverall(data) {
  const evaluated = data.courses
    .map((course) => calculateCourse(data, course))
    .filter((result) => result.completedWeight > 0);
  if (!evaluated.length) return 0;
  return evaluated.reduce((sum, result) => sum + result.projected, 0) / evaluated.length;
}

export function evaluationContribution(data, course, evaluation) {
  const type = course.assessmentTypes.find((candidate) => candidate.id === evaluation.typeId);
  if (!type || evaluation.grade === null || evaluation.grade === undefined) {
    return { weight: null, contribution: null };
  }

  const gradedCount = evaluationsFor(data, course.id, type.id)
    .filter((candidate) => candidate.grade !== null && candidate.grade !== undefined).length;
  const effectiveWeight = type.weight / Math.max(gradedCount, 1);
  return {
    weight: effectiveWeight,
    contribution: (Number(evaluation.grade) * effectiveWeight) / 100,
  };
}
